import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  AD_SCHEDULE_DEFAULT_END_HOUR,
  AD_SCHEDULE_DEFAULT_INTERVAL_SECONDS,
  AD_SCHEDULE_DEFAULT_START_HOUR,
  AD_SCHEDULE_INTERVAL_MAX,
  AD_SCHEDULE_INTERVAL_MIN,
  Collections,
  type AdScheduleDoc,
  type AdScheduleStatus,
  type CampaignDoc,
  type TerminalDoc,
} from "./schemas";

export class AdScheduleServiceError extends Error {
  constructor(
    public code:
      | "not_found"
      | "forbidden"
      | "invalid_input"
      | "schedule_finalized"
      | "campaign_not_borne",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ResolvedSchedule = AdScheduleDoc & {
  /** Live status derived from campaign + paused flag + dates. */
  liveStatus: AdScheduleStatus;
  /** True when "now" falls inside the schedule's window (hour-of-day). */
  inWindowNow: boolean;
};

/**
 * Compute the live status of an ad schedule. Cancelled/paused stay sticky;
 * everything else is derived from the campaign's lifecycle. Does not persist
 * the result — read-only computation.
 */
export function resolveScheduleStatus(
  schedule: AdScheduleDoc,
  campaign: CampaignDoc | null,
  now: Date = new Date(),
): AdScheduleStatus {
  if (schedule.status === "cancelled") return "cancelled";
  if (schedule.status === "paused") return "paused";
  if (!campaign) return "expired";
  if (campaign.status === "completed") return "expired";
  if (campaign.status === "active") {
    // Check end date as a safety net even if status not yet flipped.
    if (campaign.endDate.getTime() < now.getTime()) return "expired";
    return "live";
  }
  // draft or upcoming
  return "scheduled";
}

/**
 * Whether the current local hour falls within [startHour, endHour). When
 * endHour < startHour the window spans midnight (e.g. 20→4). Uses the
 * server's local time — fine for v1 since terminals + admins share French TZ.
 */
export function isInWindowNow(
  schedule: Pick<AdScheduleDoc, "startHour" | "endHour">,
  now: Date = new Date(),
): boolean {
  const h = now.getHours();
  const { startHour: s, endHour: e } = schedule;
  if (s === e) return false;
  if (s < e) return h >= s && h < e;
  // Overnight window
  return h >= s || h < e;
}

export function resolveSchedule(
  schedule: AdScheduleDoc,
  campaign: CampaignDoc | null,
  now: Date = new Date(),
): ResolvedSchedule {
  return {
    ...schedule,
    liveStatus: resolveScheduleStatus(schedule, campaign, now),
    inWindowNow: isInWindowNow(schedule, now),
  };
}

/**
 * Create the default schedule when an admin assigns a borne terminal to a
 * campaign. Idempotent: if a schedule already exists for the (terminal,
 * campaign) pair it's reactivated (status -> scheduled) instead of duplicated.
 */
export async function ensureScheduleForAssignment(
  terminal: TerminalDoc,
  campaign: CampaignDoc,
): Promise<AdScheduleDoc> {
  if (campaign.campaignType !== "borne") {
    throw new AdScheduleServiceError("campaign_not_borne");
  }
  if (!terminal._id || !campaign._id) {
    throw new AdScheduleServiceError("invalid_input", "missing _id");
  }
  const terminalId = terminal._id.toString();
  const campaignId = campaign._id.toString();

  const now = new Date();
  const existing = (await db
    .collection(Collections.adSchedules)
    .findOne({ terminalId, campaignId })) as AdScheduleDoc | null;

  if (existing) {
    if (existing.status === "cancelled") {
      await db.collection(Collections.adSchedules).updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "scheduled",
            updatedAt: now,
          },
          $unset: {
            pausedAt: "",
            pausedBy: "",
            pauseReason: "",
          },
        },
      );
      return {
        ...existing,
        status: "scheduled",
        updatedAt: now,
        pausedAt: undefined,
        pausedBy: undefined,
        pauseReason: undefined,
      };
    }
    return existing;
  }

  const doc: AdScheduleDoc = {
    terminalId,
    campaignId,
    partnerId: terminal.partnerId,
    companyId: campaign.companyId,
    startHour: AD_SCHEDULE_DEFAULT_START_HOUR,
    endHour: AD_SCHEDULE_DEFAULT_END_HOUR,
    intervalSeconds: AD_SCHEDULE_DEFAULT_INTERVAL_SECONDS,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  };
  const ins = await db.collection(Collections.adSchedules).insertOne(doc);
  doc._id = ins.insertedId;
  return doc;
}

export async function cancelScheduleForUnassignment(
  terminalId: string,
  campaignId: string,
): Promise<void> {
  await db.collection(Collections.adSchedules).updateMany(
    { terminalId, campaignId, status: { $ne: "cancelled" } },
    {
      $set: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    },
  );
}

export type ScheduleUpdateInput = {
  startHour?: number;
  endHour?: number;
  intervalSeconds?: number;
  // Pause/resume controls. Set status="paused" with optional reason; set
  // status="scheduled" to resume (live status will be re-derived from campaign).
  pause?: { reason?: string };
  resume?: boolean;
  pausedBy?: string;
};

export async function updateSchedule(
  scheduleId: string,
  input: ScheduleUpdateInput,
): Promise<AdScheduleDoc> {
  const oid = new ObjectId(scheduleId);
  const existing = (await db
    .collection(Collections.adSchedules)
    .findOne({ _id: oid })) as AdScheduleDoc | null;
  if (!existing) throw new AdScheduleServiceError("not_found");
  if (existing.status === "cancelled") {
    throw new AdScheduleServiceError("schedule_finalized");
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, ""> = {};

  if (input.startHour !== undefined) {
    if (
      !Number.isInteger(input.startHour) ||
      input.startHour < 0 ||
      input.startHour > 23
    ) {
      throw new AdScheduleServiceError("invalid_input", "startHour 0..23");
    }
    set.startHour = input.startHour;
  }
  if (input.endHour !== undefined) {
    if (
      !Number.isInteger(input.endHour) ||
      input.endHour < 0 ||
      input.endHour > 23
    ) {
      throw new AdScheduleServiceError("invalid_input", "endHour 0..23");
    }
    set.endHour = input.endHour;
  }
  if (input.intervalSeconds !== undefined) {
    if (
      !Number.isInteger(input.intervalSeconds) ||
      input.intervalSeconds < AD_SCHEDULE_INTERVAL_MIN ||
      input.intervalSeconds > AD_SCHEDULE_INTERVAL_MAX
    ) {
      throw new AdScheduleServiceError(
        "invalid_input",
        `intervalSeconds ${AD_SCHEDULE_INTERVAL_MIN}..${AD_SCHEDULE_INTERVAL_MAX}`,
      );
    }
    set.intervalSeconds = input.intervalSeconds;
  }

  if (input.pause) {
    set.status = "paused";
    set.pausedAt = new Date();
    if (input.pausedBy) set.pausedBy = input.pausedBy;
    if (input.pause.reason) set.pauseReason = input.pause.reason.trim();
  } else if (input.resume) {
    set.status = "scheduled"; // live status re-derived on read from campaign
    unset.pausedAt = "";
    unset.pausedBy = "";
    unset.pauseReason = "";
  }

  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;

  await db.collection(Collections.adSchedules).updateOne({ _id: oid }, update);
  const fresh = (await db
    .collection(Collections.adSchedules)
    .findOne({ _id: oid })) as AdScheduleDoc;
  return fresh;
}

/**
 * Increment per-campaign daily impression counters. Called from heartbeat.
 * Each entry's delta is added to the (terminalId, campaignId, todayUTC) row.
 */
export async function applyImpressionDeltas(
  terminalId: string,
  deltas: { campaignId: string; delta: number }[],
  now: Date = new Date(),
): Promise<void> {
  if (!deltas.length) return;
  const date = isoDate(now);
  for (const d of deltas) {
    if (!Number.isInteger(d.delta) || d.delta <= 0) continue;
    if (!d.campaignId) continue;
    await db.collection(Collections.adImpressionsDaily).updateOne(
      { terminalId, campaignId: d.campaignId, date },
      {
        $inc: { impressions: d.delta },
        $set: { updatedAt: now },
        $setOnInsert: {
          terminalId,
          campaignId: d.campaignId,
          date,
        },
      },
      { upsert: true },
    );
  }
}

export function isoDate(d: Date): string {
  // YYYY-MM-DD in UTC
  return d.toISOString().slice(0, 10);
}
