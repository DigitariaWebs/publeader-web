import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import {
  Collections,
  TERMINAL_API_KEY_BYTES,
  VENUE_TYPES,
  type TerminalDoc,
  type TerminalStatus,
  type VenueType,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import { resolveMany } from "@/lib/terminal-service";
import { serializeTerminal } from "@/lib/terminal-serializer";

const VALID_STATUSES: TerminalStatus[] = ["online", "offline", "maintenance"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const partnerId = url.searchParams.get("partnerId");
  const status = url.searchParams.get("status") as TerminalStatus | null;
  const city = url.searchParams.get("city");

  const filter: Record<string, unknown> = {};
  if (partnerId) filter.partnerId = partnerId;
  if (status && VALID_STATUSES.includes(status)) {
    filter.lastKnownStatus = status;
  }
  if (city) filter.city = city;

  const docs = (await db
    .collection(Collections.terminals)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()) as TerminalDoc[];

  const resolved = await resolveMany(docs);
  return NextResponse.json({
    terminals: resolved.map((t) => serializeTerminal(t)),
  });
}

type CreateBody = {
  partnerId?: string;
  code?: string;
  name?: string;
  venueType?: VenueType;
  address?: string;
  city?: string;
  coords?: { lat?: number; lng?: number };
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const err = validateCreate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Verify partner exists.
  let partner;
  try {
    partner = await db
      .collection(Collections.partners)
      .findOne({ _id: new ObjectId(body.partnerId!) });
  } catch {
    return NextResponse.json({ error: "invalid_partner" }, { status: 400 });
  }
  if (!partner) {
    return NextResponse.json({ error: "partner_not_found" }, { status: 404 });
  }

  // Code must be unique.
  const existing = await db
    .collection(Collections.terminals)
    .findOne({ code: body.code!.trim() });
  if (existing) {
    return NextResponse.json({ error: "code_taken" }, { status: 409 });
  }

  const rawKey = randomBytes(TERMINAL_API_KEY_BYTES).toString("hex");
  const apiKeyHash = await bcrypt.hash(rawKey, 10);

  const now = new Date();
  const doc: TerminalDoc = {
    partnerId: body.partnerId!,
    code: body.code!.trim(),
    name: body.name!.trim(),
    venueType: body.venueType!,
    address: body.address!.trim(),
    city: body.city!.trim(),
    coords: { lat: body.coords!.lat!, lng: body.coords!.lng! },
    apiKeyHash,
    lastKnownStatus: "offline",
    spraysToday: 0,
    screenStatus: "idle",
    installedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const ins = await db.collection(Collections.terminals).insertOne(doc);
  doc._id = ins.insertedId;

  return NextResponse.json({
    terminal: serializeTerminal({ ...doc, status: "offline" }),
    // Raw API key shown ONCE at creation. Store it on the device.
    apiKey: rawKey,
  });
}

function validateCreate(b: CreateBody): string | null {
  if (!b.partnerId) return "partnerId required";
  if (!b.code?.trim()) return "code required";
  if (!b.name?.trim()) return "name required";
  if (!b.venueType || !VENUE_TYPES.includes(b.venueType)) {
    return "invalid venueType";
  }
  if (!b.address?.trim()) return "address required";
  if (!b.city?.trim()) return "city required";
  if (
    !b.coords ||
    typeof b.coords.lat !== "number" ||
    typeof b.coords.lng !== "number" ||
    b.coords.lat < -90 ||
    b.coords.lat > 90 ||
    b.coords.lng < -180 ||
    b.coords.lng > 180
  ) {
    return "invalid coords";
  }
  return null;
}
