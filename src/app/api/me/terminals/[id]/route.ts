import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type MaintenanceWindowDoc,
  type TerminalDoc,
  type TerminalEventDoc,
} from "@/lib/schemas";
import { requirePartner } from "@/lib/session";
import { computeUptime, resolveTerminalStatus } from "@/lib/terminal-service";
import {
  serializeMaintenanceWindow,
  serializeTerminal,
  serializeTerminalEvent,
} from "@/lib/terminal-serializer";

type RouteCtx = { params: Promise<{ id: string }> };

const UPTIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }
  const { id } = await ctx.params;

  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const terminal = (await db
    .collection(Collections.terminals)
    .findOne({ _id: oid })) as TerminalDoc | null;

  if (!terminal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Partners may only see their own terminals.
  if (terminal.partnerId !== auth.partner._id.toString()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const resolved = await resolveTerminalStatus(terminal);
  const uptime = await computeUptime(id, UPTIME_WINDOW_MS);

  const upcoming = (await db
    .collection(Collections.maintenanceWindows)
    .find({ terminalId: id, status: { $in: ["scheduled", "active"] } })
    .sort({ startsAt: 1 })
    .toArray()) as MaintenanceWindowDoc[];

  const events = (await db
    .collection(Collections.terminalEvents)
    .find({ terminalId: id })
    .sort({ at: -1 })
    .limit(20)
    .toArray()) as TerminalEventDoc[];

  return NextResponse.json({
    terminal: serializeTerminal(resolved, uptime),
    upcomingMaintenance: upcoming.map(serializeMaintenanceWindow),
    recentEvents: events.map(serializeTerminalEvent),
  });
}
