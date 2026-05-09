import { ObjectId } from "mongodb";
import { db } from "../../db";
import {
  Collections,
  type AdImpressionDailyDoc,
  type PartnerDoc,
  type RefillLogDoc,
  type RevenueDailyDoc,
  type TerminalDoc,
} from "../../schemas";
import { getPartnerRevenueConfig } from "../../partner-revenue-service";
import { isoDate as toIsoDate } from "../../ad-schedule-service";
import {
  createReportDoc,
  drawHeader,
  drawKeyValues,
  drawSectionTitle,
  drawTable,
  eur,
  fmtNumber,
} from "../pdf-utils";
import {
  endOfDay,
  formatPeriodSlug,
  startOfDay,
  type ReportBuilder,
  type ReportPeriod,
} from "../types";

type Row = {
  code: string;
  name: string;
  partnerName: string;
  sprays: number;
  impressions: number;
  refills: number;
  spraysCents: number;
  adCents: number;
  totalCents: number;
};

async function buildBornePerformance(period: ReportPeriod): Promise<Buffer> {
  const start = startOfDay(period.start);
  const end = endOfDay(period.end);
  const startDateStr = toIsoDate(start);
  const endDateStr = toIsoDate(end);

  const [terminals, partners, dailyRevenue, dailyImpressions, refills, config] =
    await Promise.all([
      db
        .collection(Collections.terminals)
        .find({})
        .toArray() as Promise<TerminalDoc[]>,
      db
        .collection(Collections.partners)
        .find({})
        .project({ businessName: 1 })
        .toArray() as Promise<Pick<PartnerDoc, "_id" | "businessName">[]>,
      db
        .collection(Collections.revenueDaily)
        .find({ date: { $gte: startDateStr, $lte: endDateStr } })
        .toArray() as Promise<RevenueDailyDoc[]>,
      db
        .collection(Collections.adImpressionsDaily)
        .find({ date: { $gte: startDateStr, $lte: endDateStr } })
        .toArray() as Promise<AdImpressionDailyDoc[]>,
      db
        .collection(Collections.refillLogs)
        .find({ refilledAt: { $gte: start, $lte: end } })
        .toArray() as Promise<RefillLogDoc[]>,
      getPartnerRevenueConfig(),
    ]);

  const partnerMap = new Map(
    partners.map((p) => [p._id!.toString(), p.businessName]),
  );

  const sprayByTerminal = new Map<string, number>();
  dailyRevenue.forEach((r) =>
    sprayByTerminal.set(
      r.terminalId,
      (sprayByTerminal.get(r.terminalId) ?? 0) + r.spraysCount,
    ),
  );

  const impressionsByTerminal = new Map<string, number>();
  dailyImpressions.forEach((i) =>
    impressionsByTerminal.set(
      i.terminalId,
      (impressionsByTerminal.get(i.terminalId) ?? 0) + i.impressions,
    ),
  );

  const refillsByTerminal = new Map<string, number>();
  refills.forEach((r) =>
    refillsByTerminal.set(
      r.terminalId,
      (refillsByTerminal.get(r.terminalId) ?? 0) + 1,
    ),
  );

  const rows: Row[] = terminals.map((t) => {
    const sprays = sprayByTerminal.get(t._id!.toString()) ?? 0;
    const impressions = impressionsByTerminal.get(t._id!.toString()) ?? 0;
    const spraysCents = sprays * config.sprayRateCents;
    const adCents = Math.round((impressions / 1000) * config.cpmCents);
    return {
      code: t.code,
      name: t.name,
      partnerName: partnerMap.get(t.partnerId) ?? t.partnerId,
      sprays,
      impressions,
      refills: refillsByTerminal.get(t._id!.toString()) ?? 0,
      spraysCents,
      adCents,
      totalCents: spraysCents + adCents,
    };
  });

  rows.sort((a, b) => b.totalCents - a.totalCents);

  const totalSprays = rows.reduce((a, r) => a + r.sprays, 0);
  const totalImpressions = rows.reduce((a, r) => a + r.impressions, 0);
  const totalRevenueCents = rows.reduce((a, r) => a + r.totalCents, 0);
  const activeCount = rows.filter((r) => r.sprays > 0 || r.impressions > 0).length;

  const { doc, finish } = createReportDoc();
  drawHeader(doc, "Performance Leader Borne", period);

  drawSectionTitle(doc, "Synthèse");
  drawKeyValues(doc, [
    { label: "Bornes total", value: fmtNumber(terminals.length) },
    { label: "Bornes actives", value: fmtNumber(activeCount) },
    { label: "Sprays cumulés", value: fmtNumber(totalSprays) },
    { label: "Impressions ads", value: fmtNumber(totalImpressions) },
    { label: "Recharges effectuées", value: fmtNumber(refills.length) },
    { label: "Revenus partenaires", value: eur(totalRevenueCents) },
  ]);

  doc.moveDown(0.5);
  drawSectionTitle(doc, "Détail par borne");
  if (rows.length === 0) {
    doc.fontSize(9).fillColor("#666").text("Aucune borne enregistrée.");
  } else {
    drawTable(
      doc,
      [
        { header: "Code", width: 70, render: (r: Row) => r.code },
        { header: "Borne", width: 130, render: (r: Row) => r.name },
        { header: "Partenaire", width: 100, render: (r: Row) => r.partnerName },
        {
          header: "Sprays",
          width: 50,
          render: (r: Row) => fmtNumber(r.sprays),
          align: "right",
        },
        {
          header: "Imp.",
          width: 55,
          render: (r: Row) => fmtNumber(r.impressions),
          align: "right",
        },
        {
          header: "Recharges",
          width: 55,
          render: (r: Row) => fmtNumber(r.refills),
          align: "right",
        },
        {
          header: "Revenu",
          width: 75,
          render: (r: Row) => eur(r.totalCents),
          align: "right",
        },
      ],
      rows,
    );
  }

  return finish();
}

export const bornePerformanceBuilder: ReportBuilder = {
  type: "borne_performance",
  async build(period) {
    const buffer = await buildBornePerformance(period);
    return {
      buffer,
      filename: `performance-borne-${formatPeriodSlug(period)}.pdf`,
      contentType: "application/pdf",
      format: "pdf",
    };
  },
};
