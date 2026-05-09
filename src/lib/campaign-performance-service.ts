import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  type AdImpressionDailyDoc,
  type CampaignDoc,
  type TerminalDoc,
} from "./schemas";

export const PERIOD_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
} as const;

export type PerformancePeriod = keyof typeof PERIOD_DAYS;

export const PERFORMANCE_PERIODS: PerformancePeriod[] = [
  "7d",
  "30d",
  "90d",
  "365d",
];

export type KpiBlock = {
  impressionsTotal: number;
  reachTerminals: number;
  kmTotal: number;
  campaignDays: number; // Σ active days × drivers assigned for flocage
};

export type CitySliceDTO = { city: string; impressions: number };
export type CampaignSliceDTO = {
  campaignId: string;
  brand: string;
  title: string;
  impressions: number;
  pct: number; // 0..100
};

export type PerformanceDTO = {
  period: PerformancePeriod;
  windowStart: string; // ISO date
  windowEnd: string; // ISO date
  kpis: KpiBlock;
  // Daily impressions, length = PERIOD_DAYS[period], oldest first.
  impressionsTimeline: number[];
  cities: CitySliceDTO[]; // top 6
  campaigns: CampaignSliceDTO[]; // top 6 + Autres bucket if more
  generatedAt: string;
};

export type CampaignPerformanceDTO = {
  campaignId: string;
  period: PerformancePeriod;
  windowStart: string;
  windowEnd: string;
  kpis: KpiBlock;
  impressionsTimeline: number[];
  // Campaign-specific extras.
  fillRatePct: number; // 0..100
  budgetCents: number;
  budgetConsumedPct: number; // approx (kmDone/kmTotal × budget for flocage,
  // impressions/target for borne; bounded 0..100)
  generatedAt: string;
};

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildWindow(period: PerformancePeriod, now: Date) {
  const days = PERIOD_DAYS[period];
  const today = startOfUtcDay(now);
  const start = new Date(today.getTime() - (days - 1) * 86_400_000);
  return { start, end: today, days };
}

// Distributes the company's full set of campaigns into the period and
// computes both portfolio-wide and per-campaign KPI blocks.
async function loadCampaigns(companyId: string): Promise<CampaignDoc[]> {
  return (await db
    .collection(Collections.campaigns)
    .find({ companyId })
    .toArray()) as CampaignDoc[];
}

async function loadImpressions(
  campaignIds: string[],
  fromIso: string,
  toIso: string,
): Promise<AdImpressionDailyDoc[]> {
  if (campaignIds.length === 0) return [];
  return (await db
    .collection(Collections.adImpressionsDaily)
    .find({
      campaignId: { $in: campaignIds },
      date: { $gte: fromIso, $lte: toIso },
    })
    .toArray()) as AdImpressionDailyDoc[];
}

async function loadTerminalCities(
  terminalIds: string[],
): Promise<Map<string, string>> {
  const valid = terminalIds.filter((id) => ObjectId.isValid(id));
  if (valid.length === 0) return new Map();
  const docs = (await db
    .collection(Collections.terminals)
    .find({ _id: { $in: valid.map((id) => new ObjectId(id)) } })
    .project({ city: 1 })
    .toArray()) as Pick<TerminalDoc, "_id" | "city">[];
  return new Map(docs.map((t) => [t._id!.toString(), t.city]));
}

// Active campaign-days: per campaign, count how many days its [start,end]
// window intersects [windowStart, today]; multiply by driversAssigned for
// flocage (proxy for "person-hours"); for borne, use 1 × number of
// terminals targeted (count of borne.terminalIds, fallback to borne.count).
function campaignDaysContribution(
  c: CampaignDoc,
  windowStart: Date,
  windowEnd: Date,
): number {
  const cStart = startOfUtcDay(c.startDate);
  const cEnd = startOfUtcDay(c.endDate);
  const overlapStart = cStart > windowStart ? cStart : windowStart;
  const overlapEnd = cEnd < windowEnd ? cEnd : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  const days =
    Math.round(
      (overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000,
    ) + 1;
  if (c.campaignType === "borne") {
    const terminals = c.borne?.terminalIds?.length ?? c.borne?.count ?? 0;
    return days * Math.max(0, terminals);
  }
  return days * Math.max(0, c.driversAssigned);
}

export async function getCompanyPerformance(
  companyId: string,
  period: PerformancePeriod,
  now: Date = new Date(),
): Promise<PerformanceDTO> {
  const { start, end, days } = buildWindow(period, now);
  const campaigns = await loadCampaigns(companyId);
  const campaignIds = campaigns.map((c) => c._id!.toString());

  const impressions = await loadImpressions(
    campaignIds,
    isoDate(start),
    isoDate(end),
  );

  const timeline = new Array<number>(days).fill(0);
  const byCampaign = new Map<string, number>();
  const byTerminal = new Map<string, number>();

  for (const i of impressions) {
    const day = new Date(`${i.date}T00:00:00.000Z`);
    const idx = Math.floor((day.getTime() - start.getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) timeline[idx] += i.impressions;
    byCampaign.set(
      i.campaignId,
      (byCampaign.get(i.campaignId) ?? 0) + i.impressions,
    );
    byTerminal.set(
      i.terminalId,
      (byTerminal.get(i.terminalId) ?? 0) + i.impressions,
    );
  }

  const impressionsTotal = timeline.reduce((a, b) => a + b, 0);
  const reachTerminals = byTerminal.size;

  // KM lifetime sum across company's campaigns. Period-windowed km would
  // need a tracking-events collection (D9) which is not yet built.
  const kmTotal = campaigns.reduce((a, c) => a + (c.kmDone ?? 0), 0);

  // Active campaign-days within the window.
  const campaignDays = campaigns.reduce(
    (a, c) => a + campaignDaysContribution(c, start, end),
    0,
  );

  // City split via terminal lookup.
  const cityImpressions = new Map<string, number>();
  if (byTerminal.size > 0) {
    const terminalCity = await loadTerminalCities([...byTerminal.keys()]);
    byTerminal.forEach((count, terminalId) => {
      const city = terminalCity.get(terminalId) ?? "Inconnu";
      cityImpressions.set(city, (cityImpressions.get(city) ?? 0) + count);
    });
  }
  const cities: CitySliceDTO[] = [...cityImpressions.entries()]
    .map(([city, impressionsCount]) => ({ city, impressions: impressionsCount }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6);

  // Top campaigns by impressions; bucket the tail into "Autres".
  const campaignMap = new Map(campaigns.map((c) => [c._id!.toString(), c]));
  const ranked = [...byCampaign.entries()]
    .map(([id, imp]) => {
      const c = campaignMap.get(id);
      return {
        campaignId: id,
        brand: c?.brand ?? "—",
        title: c?.title ?? id,
        impressions: imp,
      };
    })
    .sort((a, b) => b.impressions - a.impressions);
  const top = ranked.slice(0, 6);
  const tail = ranked.slice(6);
  const tailSum = tail.reduce((a, r) => a + r.impressions, 0);
  const totalForPct = impressionsTotal || 1;
  const campaignsSlice: CampaignSliceDTO[] = top.map((r) => ({
    ...r,
    pct: Math.round((r.impressions / totalForPct) * 100),
  }));
  if (tailSum > 0) {
    campaignsSlice.push({
      campaignId: "_others",
      brand: "Autres",
      title: `${tail.length} campagne(s)`,
      impressions: tailSum,
      pct: Math.round((tailSum / totalForPct) * 100),
    });
  }

  return {
    period,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    kpis: {
      impressionsTotal,
      reachTerminals,
      kmTotal,
      campaignDays,
    },
    impressionsTimeline: timeline,
    cities,
    campaigns: campaignsSlice,
    generatedAt: now.toISOString(),
  };
}

export async function getCampaignPerformance(
  companyId: string,
  campaignId: string,
  period: PerformancePeriod,
  now: Date = new Date(),
): Promise<CampaignPerformanceDTO | null> {
  if (!ObjectId.isValid(campaignId)) return null;
  const c = (await db
    .collection(Collections.campaigns)
    .findOne({ _id: new ObjectId(campaignId), companyId })) as CampaignDoc | null;
  if (!c) return null;

  const { start, end, days } = buildWindow(period, now);
  const impressions = await loadImpressions(
    [campaignId],
    isoDate(start),
    isoDate(end),
  );

  const timeline = new Array<number>(days).fill(0);
  const terminals = new Set<string>();
  let impressionsTotal = 0;
  for (const i of impressions) {
    const day = new Date(`${i.date}T00:00:00.000Z`);
    const idx = Math.floor((day.getTime() - start.getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) timeline[idx] += i.impressions;
    impressionsTotal += i.impressions;
    terminals.add(i.terminalId);
  }

  const fillRatePct =
    c.campaignType === "flocage"
      ? c.driversNeeded > 0
        ? Math.round((Math.min(c.driversAssigned, c.driversNeeded) / c.driversNeeded) * 100)
        : 0
      : c.borne?.targetImpressions && c.borne.targetImpressions > 0
        ? Math.round(
            (Math.min(impressionsTotal, c.borne.targetImpressions) /
              c.borne.targetImpressions) *
              100,
          )
        : 0;

  const budgetConsumedPct =
    c.campaignType === "flocage"
      ? c.kmTotal > 0
        ? Math.round((Math.min(c.kmDone, c.kmTotal) / c.kmTotal) * 100)
        : 0
      : fillRatePct; // borne: progress mirrors fill rate against target impressions

  return {
    campaignId,
    period,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    kpis: {
      impressionsTotal,
      reachTerminals: terminals.size,
      kmTotal: c.kmDone ?? 0,
      campaignDays: campaignDaysContribution(c, start, end),
    },
    impressionsTimeline: timeline,
    fillRatePct,
    budgetCents: c.budgetCents ?? 0,
    budgetConsumedPct,
    generatedAt: now.toISOString(),
  };
}
