import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { db } from "@/lib/db";
import {
  CARTRIDGE_SLOT_COUNT,
  Collections,
  type CartridgeSlot,
  type ScreenStatus,
  type TerminalDoc,
} from "@/lib/schemas";
import { resolveTerminalStatus } from "@/lib/terminal-service";
import { applyImpressionDeltas } from "@/lib/ad-schedule-service";

type CartridgeUpdate = {
  slot: number;
  // Optional: hardware may also report which scent SKU is loaded. Server
  // ignores unknown SKUs (admin must add them via /api/admin/scents first).
  scentSku?: string;
  spraysSinceRefill?: number;
  levelPercent?: number;
};

type ImpressionDelta = {
  campaignId: string;
  delta: number;
};

type HeartbeatBody = {
  terminalCode?: string;
  spraysToday?: number;
  screenStatus?: ScreenStatus;
  cartridges?: CartridgeUpdate[];
  impressions?: ImpressionDelta[];
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

  // Apply cartridge snapshot. Each entry replaces the matching slot's
  // sprays + level fields; scent assignment only changes when scentSku
  // resolves to a known scent and matches/replaces the existing slot.
  if (body.cartridges?.length) {
    const skuMap = await loadScentSkuMap(body.cartridges);
    const merged: CartridgeSlot[] = terminal.cartridges.map((existing) => {
      const incoming = body.cartridges!.find((c) => c.slot === existing.slot);
      if (!incoming) return existing;
      const next: CartridgeSlot = { ...existing };
      if (
        typeof incoming.spraysSinceRefill === "number" &&
        incoming.spraysSinceRefill >= 0
      ) {
        next.spraysSinceRefill = Math.floor(incoming.spraysSinceRefill);
      }
      if (
        typeof incoming.levelPercent === "number" &&
        incoming.levelPercent >= 0 &&
        incoming.levelPercent <= 100
      ) {
        next.levelPercent = incoming.levelPercent;
      }
      // scentSku optional override — only set if catalog match.
      if (incoming.scentSku) {
        const id = skuMap.get(incoming.scentSku.toUpperCase());
        if (id) next.scentId = id;
      }
      return next;
    });
    update.cartridges = merged;
  }

  await db
    .collection(Collections.terminals)
    .updateOne({ _id: terminal._id }, { $set: update });

  // Apply per-campaign impression deltas (P4). No-op if absent or empty.
  if (Array.isArray(body.impressions) && body.impressions.length) {
    await applyImpressionDeltas(
      terminal._id!.toString(),
      body.impressions.filter(
        (i) => typeof i.campaignId === "string" && typeof i.delta === "number",
      ),
      now,
    );
  }

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

async function loadScentSkuMap(
  cartridges: CartridgeUpdate[],
): Promise<Map<string, string>> {
  const skus = cartridges
    .map((c) => c.scentSku?.toUpperCase().trim())
    .filter((s): s is string => !!s);
  if (!skus.length) return new Map();
  const docs = await db
    .collection(Collections.scents)
    .find({ sku: { $in: Array.from(new Set(skus)) } })
    .toArray();
  return new Map(docs.map((d) => [d.sku as string, d._id.toString()]));
}
