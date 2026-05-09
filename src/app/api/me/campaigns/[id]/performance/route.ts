import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  PERFORMANCE_PERIODS,
  getCampaignPerformance,
  type PerformancePeriod,
} from "@/lib/campaign-performance-service";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const a = await requireAdvertiser(req.headers);
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30d";
  const period = (PERFORMANCE_PERIODS as string[]).includes(periodParam)
    ? (periodParam as PerformancePeriod)
    : "30d";

  const data = await getCampaignPerformance(a.user.companyId!, id, period);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
