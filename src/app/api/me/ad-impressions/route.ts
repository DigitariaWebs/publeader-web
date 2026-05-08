import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  Collections,
  type AdImpressionDailyDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requirePartner } from "@/lib/session";
import { isoDate } from "@/lib/ad-schedule-service";
import { serializeImpressionDaily } from "@/lib/ad-serializer";

export async function GET(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }
  const partnerId = auth.partner._id.toString();

  const url = new URL(req.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days") ?? "7"), 1),
    90,
  );
  const terminalId = url.searchParams.get("terminalId");

  // Resolve which terminals belong to this partner.
  const terminalFilter: Record<string, unknown> = { partnerId };
  if (terminalId) terminalFilter._id = new (await import("mongodb")).ObjectId(terminalId);
  const terminals = (await db
    .collection(Collections.terminals)
    .find(terminalFilter)
    .toArray()) as TerminalDoc[];
  const terminalIds = terminals.map((t) => t._id!.toString());
  if (!terminalIds.length) {
    return NextResponse.json({ rows: [] });
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days + 1);
  since.setUTCHours(0, 0, 0, 0);
  const sinceStr = isoDate(since);

  const rows = (await db
    .collection(Collections.adImpressionsDaily)
    .find({
      terminalId: { $in: terminalIds },
      date: { $gte: sinceStr },
    })
    .sort({ date: 1 })
    .toArray()) as AdImpressionDailyDoc[];

  return NextResponse.json({
    rows: rows.map(serializeImpressionDaily),
  });
}
