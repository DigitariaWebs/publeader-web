import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import {
  Collections,
  TERMINAL_API_KEY_BYTES,
  VENUE_TYPES,
  type MaintenanceWindowDoc,
  type TerminalDoc,
  type TerminalEventDoc,
  type VenueType,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import { computeUptime, resolveTerminalStatus } from "@/lib/terminal-service";
import {
  serializeMaintenanceWindow,
  serializeTerminal,
  serializeTerminalEvent,
} from "@/lib/terminal-serializer";

type RouteCtx = { params: Promise<{ id: string }> };

const UPTIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30d

async function loadTerminal(id: string): Promise<TerminalDoc | null> {
  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return null;
  }
  return (await db
    .collection(Collections.terminals)
    .findOne({ _id: oid })) as TerminalDoc | null;
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const terminal = await loadTerminal(id);
  if (!terminal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const resolved = await resolveTerminalStatus(terminal);
  const uptime = await computeUptime(id, UPTIME_WINDOW_MS);

  const windows = (await db
    .collection(Collections.maintenanceWindows)
    .find({ terminalId: id })
    .sort({ startsAt: -1 })
    .limit(20)
    .toArray()) as MaintenanceWindowDoc[];

  const events = (await db
    .collection(Collections.terminalEvents)
    .find({ terminalId: id })
    .sort({ at: -1 })
    .limit(50)
    .toArray()) as TerminalEventDoc[];

  return NextResponse.json({
    terminal: serializeTerminal(resolved, uptime),
    maintenanceWindows: windows.map(serializeMaintenanceWindow),
    events: events.map(serializeTerminalEvent),
  });
}

type UpdateBody = {
  name?: string;
  venueType?: VenueType;
  address?: string;
  city?: string;
  coords?: { lat?: number; lng?: number };
  partnerId?: string;
  decommission?: boolean;
  rotateApiKey?: boolean;
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const terminal = await loadTerminal(id);
  if (!terminal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  let newRawKey: string | undefined;

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    set.name = body.name.trim();
  }
  if (body.venueType !== undefined) {
    if (!VENUE_TYPES.includes(body.venueType)) {
      return NextResponse.json({ error: "invalid venueType" }, { status: 400 });
    }
    set.venueType = body.venueType;
  }
  if (body.address !== undefined) {
    if (!body.address.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    set.address = body.address.trim();
  }
  if (body.city !== undefined) {
    if (!body.city.trim()) {
      return NextResponse.json({ error: "city required" }, { status: 400 });
    }
    set.city = body.city.trim();
  }
  if (body.coords !== undefined) {
    const c = body.coords;
    if (
      !c ||
      typeof c.lat !== "number" ||
      typeof c.lng !== "number" ||
      c.lat < -90 ||
      c.lat > 90 ||
      c.lng < -180 ||
      c.lng > 180
    ) {
      return NextResponse.json({ error: "invalid coords" }, { status: 400 });
    }
    set.coords = { lat: c.lat, lng: c.lng };
  }
  if (body.partnerId !== undefined) {
    let partner;
    try {
      partner = await db
        .collection(Collections.partners)
        .findOne({ _id: new ObjectId(body.partnerId) });
    } catch {
      return NextResponse.json({ error: "invalid_partner" }, { status: 400 });
    }
    if (!partner) {
      return NextResponse.json({ error: "partner_not_found" }, { status: 404 });
    }
    set.partnerId = body.partnerId;
  }
  if (body.decommission === true && !terminal.decommissionedAt) {
    set.decommissionedAt = new Date();
  }
  if (body.rotateApiKey === true) {
    newRawKey = randomBytes(TERMINAL_API_KEY_BYTES).toString("hex");
    set.apiKeyHash = await bcrypt.hash(newRawKey, 10);
  }

  await db
    .collection(Collections.terminals)
    .updateOne({ _id: terminal._id }, { $set: set });

  const fresh = (await db
    .collection(Collections.terminals)
    .findOne({ _id: terminal._id })) as TerminalDoc;
  const resolved = await resolveTerminalStatus(fresh);

  return NextResponse.json({
    terminal: serializeTerminal(resolved),
    apiKey: newRawKey,
  });
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const terminal = await loadTerminal(id);
  if (!terminal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Soft delete: mark decommissioned. Keep history (events + windows).
  await db
    .collection(Collections.terminals)
    .updateOne(
      { _id: terminal._id },
      { $set: { decommissionedAt: new Date(), updatedAt: new Date() } },
    );

  return NextResponse.json({ ok: true });
}
