import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type AdScheduleDoc,
  type AdScheduleStatus,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import { resolveSchedule } from "@/lib/ad-schedule-service";
import { serializeSchedule } from "@/lib/ad-serializer";

const VALID_STATUSES: AdScheduleStatus[] = [
  "live",
  "scheduled",
  "paused",
  "expired",
  "cancelled",
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const terminalId = url.searchParams.get("terminalId");
  const campaignId = url.searchParams.get("campaignId");
  const status = url.searchParams.get("status") as AdScheduleStatus | null;

  const filter: Record<string, unknown> = {};
  if (partnerId) filter.partnerId = partnerId;
  if (terminalId) filter.terminalId = terminalId;
  if (campaignId) filter.campaignId = campaignId;
  if (status && VALID_STATUSES.includes(status)) filter.status = status;

  const schedules = (await db
    .collection(Collections.adSchedules)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray()) as AdScheduleDoc[];

  const joins = await loadJoins(schedules);
  const now = new Date();
  return NextResponse.json({
    schedules: schedules.map((s) => {
      const c = joins.campaigns.get(s.campaignId);
      const t = joins.terminals.get(s.terminalId);
      return serializeSchedule(resolveSchedule(s, c ?? null, now), {
        campaignTitle: c?.title,
        campaignBrand: c?.brand,
        campaignType: c?.campaignType,
        campaignStartDate: c?.startDate,
        campaignEndDate: c?.endDate,
        terminalName: t?.name,
        terminalCode: t?.code,
      });
    }),
  });
}

type Joins = {
  campaigns: Map<string, CampaignDoc>;
  terminals: Map<string, TerminalDoc>;
};

async function loadJoins(schedules: AdScheduleDoc[]): Promise<Joins> {
  const campaignIds = Array.from(new Set(schedules.map((s) => s.campaignId)));
  const terminalIds = Array.from(new Set(schedules.map((s) => s.terminalId)));
  const [campaignDocs, terminalDocs] = await Promise.all([
    campaignIds.length
      ? (db
          .collection(Collections.campaigns)
          .find({
            _id: { $in: campaignIds.map((s) => new ObjectId(s)) },
          })
          .toArray() as Promise<CampaignDoc[]>)
      : Promise.resolve([]),
    terminalIds.length
      ? (db
          .collection(Collections.terminals)
          .find({
            _id: { $in: terminalIds.map((s) => new ObjectId(s)) },
          })
          .toArray() as Promise<TerminalDoc[]>)
      : Promise.resolve([]),
  ]);
  return {
    campaigns: new Map(campaignDocs.map((c) => [c._id!.toString(), c])),
    terminals: new Map(terminalDocs.map((t) => [t._id!.toString(), t])),
  };
}
