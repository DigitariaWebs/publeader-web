import { db } from "./db";
import { Collections, type CampaignDoc } from "./schemas";
import { ObjectId } from "mongodb";

export type StatsPeriod = "week" | "month" | "3mo" | "year";

const PERIOD_DAYS: Record<StatsPeriod, number> = {
  week: 7,
  month: 30,
  "3mo": 90,
  year: 365,
};

export type LifetimeStats = {
  campaignsDone: number;
  totalKm: number;
  totalEarnings: number;
};

export type PeriodStats = {
  period: StatsPeriod;
  windowStart: string;
  windowEnd: string;
  campaignsDone: number;
  earnings: number;
  km: number;
  activeCampaigns: number;
  growthPercent: number; // vs same-length immediately-prior period
  monthlyEarnings: number; // 30-day rolling, regardless of selected period
  monthlyBreakdown: { month: string; amount: number; campaigns: number }[];
};

// Per-driver km split: campaign km credited evenly across assigned drivers.
// Reward also flat per-completion. Rough but consistent until per-driver
// tracking lands (D5).
function shareForDriver(c: CampaignDoc): { km: number; earnings: number } {
  const split = Math.max(1, c.driversAssigned);
  return {
    km: Math.round((c.kmDone || c.kmTotal) / split),
    earnings: c.reward,
  };
}

async function findCampaignsForDriver(
  driverId: string,
  filter: Record<string, unknown> = {},
): Promise<CampaignDoc[]> {
  return (await db
    .collection(Collections.campaigns)
    .find({ assignedDriverIds: driverId, ...filter })
    .toArray()) as CampaignDoc[];
}

export async function recomputeLifetimeStats(
  driverId: string,
): Promise<LifetimeStats> {
  const completed = await findCampaignsForDriver(driverId, {
    status: "completed",
  });

  let campaignsDone = 0;
  let totalKm = 0;
  let totalEarnings = 0;

  for (const c of completed) {
    const share = shareForDriver(c);
    campaignsDone += 1;
    totalKm += share.km;
    totalEarnings += share.earnings;
  }

  const lifetime: LifetimeStats = { campaignsDone, totalKm, totalEarnings };

  await db.collection(Collections.drivers).updateOne(
    { _id: new ObjectId(driverId) },
    {
      $set: {
        campaignsDone: lifetime.campaignsDone,
        totalKm: lifetime.totalKm,
        totalEarnings: lifetime.totalEarnings,
      },
    },
  );

  return lifetime;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(d: Date): string {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export async function computePeriodStats(
  driverId: string,
  period: StatsPeriod,
  now: Date = new Date(),
): Promise<PeriodStats> {
  const days = PERIOD_DAYS[period];
  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - days * 86400000);
  const priorStart = new Date(windowStart.getTime() - days * 86400000);

  const all = await findCampaignsForDriver(driverId);

  let activeCampaigns = 0;
  let currentEarnings = 0;
  let currentKm = 0;
  let currentDone = 0;
  let priorEarnings = 0;
  let monthlyEarnings = 0;

  // Monthly breakdown for last 6 months.
  const monthlyMap = new Map<string, { amount: number; campaigns: number }>();
  const sixMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 5,
    1,
  );

  const monthAgo = new Date(now.getTime() - 30 * 86400000);

  for (const c of all) {
    if (c.status === "active") activeCampaigns += 1;

    if (c.status === "completed") {
      const share = shareForDriver(c);
      const completedAt = c.endDate;

      if (completedAt >= windowStart && completedAt <= windowEnd) {
        currentDone += 1;
        currentEarnings += share.earnings;
        currentKm += share.km;
      }
      if (completedAt >= priorStart && completedAt < windowStart) {
        priorEarnings += share.earnings;
      }
      if (completedAt >= monthAgo && completedAt <= now) {
        monthlyEarnings += share.earnings;
      }
      if (completedAt >= sixMonthsAgo && completedAt <= now) {
        const key = monthKey(startOfMonth(completedAt));
        const prev = monthlyMap.get(key) ?? { amount: 0, campaigns: 0 };
        monthlyMap.set(key, {
          amount: prev.amount + share.earnings,
          campaigns: prev.campaigns + 1,
        });
      }
    }
  }

  const growthPercent =
    priorEarnings > 0
      ? Math.round(((currentEarnings - priorEarnings) / priorEarnings) * 100)
      : currentEarnings > 0
        ? 100
        : 0;

  const monthlyBreakdown = Array.from(monthlyMap.entries())
    .map(([month, v]) => ({ month, amount: v.amount, campaigns: v.campaigns }))
    .reverse(); // most recent first

  return {
    period,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    campaignsDone: currentDone,
    earnings: currentEarnings,
    km: currentKm,
    activeCampaigns,
    growthPercent,
    monthlyEarnings,
    monthlyBreakdown,
  };
}
