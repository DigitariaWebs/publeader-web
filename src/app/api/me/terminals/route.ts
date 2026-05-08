import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Collections, type TerminalDoc } from "@/lib/schemas";
import { requirePartner } from "@/lib/session";
import { resolveMany } from "@/lib/terminal-service";
import { serializeTerminal } from "@/lib/terminal-serializer";

export async function GET(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }

  const partnerId = auth.partner._id.toString();

  const docs = (await db
    .collection(Collections.terminals)
    .find({ partnerId, decommissionedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .toArray()) as TerminalDoc[];

  const resolved = await resolveMany(docs);
  return NextResponse.json({
    terminals: resolved.map((t) => serializeTerminal(t)),
  });
}
