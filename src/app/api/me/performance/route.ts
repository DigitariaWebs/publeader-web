import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  PERFORMANCE_PERIODS,
  getCompanyPerformance,
  type PerformancePeriod,
} from "@/lib/campaign-performance-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = await requireAdvertiser(req.headers);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30d";
  const period = (PERFORMANCE_PERIODS as string[]).includes(periodParam)
    ? (periodParam as PerformancePeriod)
    : "30d";
  const data = await getCompanyPerformance(a.user.companyId!, period);
  return NextResponse.json(data);
}
