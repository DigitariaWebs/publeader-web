import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type AdScheduleDoc,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requirePartner } from "@/lib/session";
import { resolveSchedule } from "@/lib/ad-schedule-service";
import { serializeSchedule } from "@/lib/ad-serializer";

export async function GET(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }
  const partnerId = auth.partner._id.toString();

  const url = new URL(req.url);
  const terminalId = url.searchParams.get("terminalId");
  const filter: Record<string, unknown> = { partnerId };
  if (terminalId) filter.terminalId = terminalId;

  const schedules = (await db
    .collection(Collections.adSchedules)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray()) as AdScheduleDoc[];

  if (!schedules.length) {
    return NextResponse.json({ schedules: [] });
  }

  const campaignIds = Array.from(new Set(schedules.map((s) => s.campaignId)));
  const terminalIds = Array.from(new Set(schedules.map((s) => s.terminalId)));
  const [campaignDocs, terminalDocs] = await Promise.all([
    db
      .collection(Collections.campaigns)
      .find({ _id: { $in: campaignIds.map((s) => new ObjectId(s)) } })
      .toArray() as Promise<CampaignDoc[]>,
    db
      .collection(Collections.terminals)
      .find({ _id: { $in: terminalIds.map((s) => new ObjectId(s)) } })
      .toArray() as Promise<TerminalDoc[]>,
  ]);

  // Brand metadata join (best-effort).
  const companyIds = Array.from(new Set(campaignDocs.map((c) => c.companyId)));
  const companies = companyIds.length
    ? await db
        .collection(Collections.companies)
        .find({ _id: { $in: companyIds.map((s) => new ObjectId(s)) } })
        .toArray()
    : [];
  const brandColorMap = new Map(
    companies.map((c) => [c._id.toString(), c.brandColor as string | undefined]),
  );

  const campaignMap = new Map(campaignDocs.map((c) => [c._id!.toString(), c]));
  const terminalMap = new Map(terminalDocs.map((t) => [t._id!.toString(), t]));

  const now = new Date();
  return NextResponse.json({
    schedules: schedules.map((s) => {
      const c = campaignMap.get(s.campaignId);
      const t = terminalMap.get(s.terminalId);
      return serializeSchedule(resolveSchedule(s, c ?? null, now), {
        campaignTitle: c?.title,
        campaignBrand: c?.brand,
        campaignBrandColor: c ? brandColorMap.get(c.companyId) : undefined,
        campaignType: c?.campaignType,
        campaignStartDate: c?.startDate,
        campaignEndDate: c?.endDate,
        terminalName: t?.name,
        terminalCode: t?.code,
      });
    }),
  });
}
