import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collections } from "@/lib/schemas";
import { ObjectId } from "mongodb";
import { computePeriodStats } from "@/lib/driver-stats";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = session.user as typeof session.user & {
    role?: string;
    status?: string;
    phone?: string;
    driverId?: string;
    companyId?: string;
    partnerId?: string;
  };

  let driver = null;
  let company = null;
  let partner = null;
  let driverStats = null;

  if (user.driverId) {
    driver = await db
      .collection(Collections.drivers)
      .findOne({ _id: new ObjectId(user.driverId) });
    if (driver) {
      // Home screen needs monthlyEarnings + growthPercent in addition to
      // lifetime totals. Compute the rolling 30d window once.
      const month = await computePeriodStats(user.driverId, "month");
      driverStats = {
        monthlyEarnings: month.monthlyEarnings,
        growthPercent: month.growthPercent,
        activeCampaigns: month.activeCampaigns,
      };
    }
  }
  if (user.companyId) {
    company = await db
      .collection(Collections.companies)
      .findOne({ _id: new ObjectId(user.companyId) });
  }
  if (user.partnerId) {
    partner = await db
      .collection(Collections.partners)
      .findOne({ _id: new ObjectId(user.partnerId) });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "driver",
      status: user.status ?? "pending",
      phone: user.phone,
      emailVerified: user.emailVerified,
    },
    driver,
    driverStats,
    company,
    partner,
  });
}
