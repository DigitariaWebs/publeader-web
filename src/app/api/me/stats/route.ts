import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/session";
import {
  computePeriodStats,
  type StatsPeriod,
} from "@/lib/driver-stats";

const VALID: StatsPeriod[] = ["week", "month", "3mo", "year"];

export async function GET(req: NextRequest) {
  const auth = await requireDriver(req.headers);
  if (!auth.ok) return auth.response;
  const { driver } = auth;

  const url = new URL(req.url);
  const raw = url.searchParams.get("period") ?? "month";
  const period = (VALID.includes(raw as StatsPeriod) ? raw : "month") as StatsPeriod;

  const periodStats = await computePeriodStats(
    driver._id!.toString(),
    period,
  );

  return NextResponse.json({
    lifetime: {
      campaignsDone: driver.campaignsDone ?? 0,
      totalKm: driver.totalKm ?? 0,
      totalEarnings: driver.totalEarnings ?? 0,
      rating: driver.rating ?? 0,
    },
    period: periodStats,
  });
}
