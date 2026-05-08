import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import {
  Collections,
  type ScreenStatus,
  type TerminalDoc,
} from "@/lib/schemas";
import { resolveTerminalStatus } from "@/lib/terminal-service";

type HeartbeatBody = {
  terminalCode?: string;
  spraysToday?: number;
  screenStatus?: ScreenStatus;
};

const VALID_SCREEN_STATUS: ScreenStatus[] = ["active", "idle", "fault"];

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-terminal-key");
  if (!apiKey) {
    return NextResponse.json({ error: "missing_key" }, { status: 401 });
  }

  let body: HeartbeatBody;
  try {
    body = (await req.json()) as HeartbeatBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.terminalCode?.trim()) {
    return NextResponse.json(
      { error: "missing_terminal_code" },
      { status: 400 },
    );
  }

  const terminal = (await db.collection(Collections.terminals).findOne({
    code: body.terminalCode.trim(),
  })) as TerminalDoc | null;
  if (!terminal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (terminal.decommissionedAt) {
    return NextResponse.json({ error: "decommissioned" }, { status: 410 });
  }

  // Constant-time check via bcrypt.
  const ok = await bcrypt.compare(apiKey, terminal.apiKeyHash);
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    lastHeartbeatAt: now,
    updatedAt: now,
  };
  if (typeof body.spraysToday === "number" && body.spraysToday >= 0) {
    update.spraysToday = Math.floor(body.spraysToday);
  }
  if (body.screenStatus && VALID_SCREEN_STATUS.includes(body.screenStatus)) {
    update.screenStatus = body.screenStatus;
  }

  await db
    .collection(Collections.terminals)
    .updateOne({ _id: terminal._id }, { $set: update });

  // Re-fetch and resolve to emit transition events.
  const fresh = (await db
    .collection(Collections.terminals)
    .findOne({ _id: terminal._id })) as TerminalDoc;
  const resolved = await resolveTerminalStatus(fresh, now);

  return NextResponse.json({
    ok: true,
    status: resolved.status,
    serverTime: now.toISOString(),
  });
}
