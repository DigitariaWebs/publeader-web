import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  TERMINAL_OFFLINE_THRESHOLD_MS,
  type MaintenanceWindowDoc,
  type TerminalDoc,
  type TerminalEventDoc,
  type TerminalEventType,
  type TerminalStatus,
} from "./schemas";

export class TerminalServiceError extends Error {
  constructor(
    public code:
      | "not_found"
      | "forbidden"
      | "code_taken"
      | "invalid_input"
      | "decommissioned"
      | "invalid_window",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ResolvedTerminal = TerminalDoc & {
  /** Computed status for this read. May differ from lastKnownStatus until persisted. */
  status: TerminalStatus;
  /** Active maintenance window covering `now`, if any. */
  activeMaintenance?: MaintenanceWindowDoc;
};

/**
 * Compute the live status of a terminal from its heartbeat freshness and
 * any active maintenance window. Persists the new status + writes a status
 * event when it differs from `lastKnownStatus`. Idempotent.
 */
export async function resolveTerminalStatus(
  terminal: TerminalDoc,
  now: Date = new Date(),
): Promise<ResolvedTerminal> {
  if (!terminal._id) {
    throw new TerminalServiceError("not_found", "terminal has no _id");
  }
  const id = terminal._id.toString();

  // 1. Active maintenance window beats heartbeat.
  const activeMaintenance = (await db
    .collection(Collections.maintenanceWindows)
    .findOne({
      terminalId: id,
      status: { $in: ["scheduled", "active"] },
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    })) as MaintenanceWindowDoc | null;

  let resolved: TerminalStatus;
  if (activeMaintenance) {
    resolved = "maintenance";
  } else if (terminal.decommissionedAt) {
    resolved = "offline";
  } else if (!terminal.lastHeartbeatAt) {
    resolved = "offline";
  } else {
    const age = now.getTime() - terminal.lastHeartbeatAt.getTime();
    resolved = age < TERMINAL_OFFLINE_THRESHOLD_MS ? "online" : "offline";
  }

  // 2. Persist + emit transition event if status changed.
  if (resolved !== terminal.lastKnownStatus) {
    const eventType = resolveEventType(terminal.lastKnownStatus, resolved);
    if (eventType) {
      const event: TerminalEventDoc = {
        terminalId: id,
        type: eventType,
        at: now,
        meta: activeMaintenance
          ? { maintenanceWindowId: activeMaintenance._id?.toString() }
          : undefined,
      };
      await db.collection(Collections.terminalEvents).insertOne(event);
    }
    await db.collection(Collections.terminals).updateOne(
      { _id: terminal._id },
      { $set: { lastKnownStatus: resolved, updatedAt: now } },
    );
    terminal.lastKnownStatus = resolved;
    terminal.updatedAt = now;
  }

  // 3. Auto-flip maintenance window state if needed.
  if (activeMaintenance && activeMaintenance.status === "scheduled") {
    await db
      .collection(Collections.maintenanceWindows)
      .updateOne({ _id: activeMaintenance._id }, { $set: { status: "active" } });
    activeMaintenance.status = "active";
  }

  // Mark expired active windows as done. Done outside transactions for now.
  await db
    .collection(Collections.maintenanceWindows)
    .updateMany(
      { terminalId: id, status: "active", endsAt: { $lt: now } },
      { $set: { status: "done" } },
    );

  return {
    ...terminal,
    status: resolved,
    activeMaintenance: activeMaintenance ?? undefined,
  };
}

function resolveEventType(
  from: TerminalStatus,
  to: TerminalStatus,
): TerminalEventType | null {
  if (from === to) return null;
  if (to === "online") return "online";
  if (to === "offline") return "offline";
  if (to === "maintenance") return "maintenance_start";
  if (from === "maintenance") return "maintenance_end";
  return null;
}

/**
 * Compute uptime % over a rolling window from the status event log.
 * Excludes maintenance time from both numerator and denominator (treated
 * as planned downtime, not unavailability).
 */
export async function computeUptime(
  terminalId: string,
  windowMs: number,
  now: Date = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - windowMs);
  const events = (await db
    .collection(Collections.terminalEvents)
    .find({ terminalId, at: { $gte: since } })
    .sort({ at: 1 })
    .toArray()) as TerminalEventDoc[];

  // Find the status that was active at `since` (last event before window).
  const prior = (await db
    .collection(Collections.terminalEvents)
    .find({ terminalId, at: { $lt: since } })
    .sort({ at: -1 })
    .limit(1)
    .toArray()) as TerminalEventDoc[];

  let currentStatus: TerminalStatus = "offline";
  if (prior[0]) {
    currentStatus = eventTypeToStatus(prior[0].type) ?? "offline";
  }

  let cursor = since.getTime();
  let onlineMs = 0;
  let countableMs = 0; // online + offline (excludes maintenance)

  const tick = (until: number) => {
    const span = until - cursor;
    if (span <= 0) return;
    if (currentStatus === "maintenance") {
      // skip — not counted
    } else {
      countableMs += span;
      if (currentStatus === "online") onlineMs += span;
    }
    cursor = until;
  };

  for (const e of events) {
    tick(e.at.getTime());
    const next = eventTypeToStatus(e.type);
    if (next) currentStatus = next;
  }
  tick(now.getTime());

  if (countableMs === 0) return 0;
  return (onlineMs / countableMs) * 100;
}

function eventTypeToStatus(t: TerminalEventType): TerminalStatus | null {
  if (t === "online") return "online";
  if (t === "offline") return "offline";
  if (t === "maintenance_start") return "maintenance";
  if (t === "maintenance_end") return "online";
  return null;
}

/**
 * Resolve many terminals at once. Useful for list endpoints. Persists
 * transitions sequentially (small N expected per partner / per admin view).
 */
export async function resolveMany(
  terminals: TerminalDoc[],
  now: Date = new Date(),
): Promise<ResolvedTerminal[]> {
  const out: ResolvedTerminal[] = [];
  for (const t of terminals) {
    out.push(await resolveTerminalStatus(t, now));
  }
  return out;
}

/**
 * Schedule a maintenance window. Validates dates and overlapping scheduled
 * windows on the same terminal. Returns the inserted window.
 */
export async function scheduleMaintenance(
  terminalId: string,
  startsAt: Date,
  endsAt: Date,
  reason: string,
  createdBy: string,
): Promise<MaintenanceWindowDoc> {
  if (
    !(startsAt instanceof Date) ||
    !(endsAt instanceof Date) ||
    isNaN(startsAt.getTime()) ||
    isNaN(endsAt.getTime())
  ) {
    throw new TerminalServiceError("invalid_window", "invalid dates");
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new TerminalServiceError("invalid_window", "end must be after start");
  }
  const exists = await db
    .collection(Collections.terminals)
    .findOne({ _id: new ObjectId(terminalId) });
  if (!exists) throw new TerminalServiceError("not_found");

  const overlap = await db.collection(Collections.maintenanceWindows).findOne({
    terminalId,
    status: { $in: ["scheduled", "active"] },
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
  });
  if (overlap) {
    throw new TerminalServiceError(
      "invalid_window",
      "overlaps existing window",
    );
  }

  const doc: MaintenanceWindowDoc = {
    terminalId,
    startsAt,
    endsAt,
    reason: reason.trim(),
    status: "scheduled",
    createdBy,
    createdAt: new Date(),
  };
  const ins = await db
    .collection(Collections.maintenanceWindows)
    .insertOne(doc);
  doc._id = ins.insertedId;
  return doc;
}

export async function cancelMaintenance(
  windowId: string,
): Promise<MaintenanceWindowDoc> {
  const oid = new ObjectId(windowId);
  const win = (await db
    .collection(Collections.maintenanceWindows)
    .findOne({ _id: oid })) as MaintenanceWindowDoc | null;
  if (!win) throw new TerminalServiceError("not_found");
  if (win.status === "done" || win.status === "cancelled") {
    throw new TerminalServiceError("invalid_window", "already finalized");
  }
  await db
    .collection(Collections.maintenanceWindows)
    .updateOne({ _id: oid }, { $set: { status: "cancelled" } });
  win.status = "cancelled";
  return win;
}
