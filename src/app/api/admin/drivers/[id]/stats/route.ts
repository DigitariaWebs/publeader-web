import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { Collections, type DriverDoc } from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import {
  computePeriodStats,
  type StatsPeriod,
} from "@/lib/driver-stats";

const VALID: StatsPeriod[] = ["week", "month", "3mo", "year"];

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const driver = (await db
    .collection(Collections.drivers)
    .findOne({ _id: new ObjectId(id) })) as DriverDoc | null;

  if (!driver) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("period") ?? "month";
  const period = (VALID.includes(raw as StatsPeriod) ? raw : "month") as StatsPeriod;

  const periodStats = await computePeriodStats(id, period);

  return NextResponse.json({
    driver: {
      id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      city: driver.city,
      status: driver.status,
    },
    lifetime: {
      campaignsDone: driver.campaignsDone ?? 0,
      totalKm: driver.totalKm ?? 0,
      totalEarnings: driver.totalEarnings ?? 0,
      rating: driver.rating ?? 0,
    },
    period: periodStats,
  });
}
