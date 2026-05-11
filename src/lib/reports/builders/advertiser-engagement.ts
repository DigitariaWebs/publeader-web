import { db } from "../../db";
import {
  Collections,
  type AdImpressionDailyDoc,
  type CampaignDoc,
  type CompanyDoc,
  type InvoiceDoc,
} from "../../schemas";
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
  companyId: string;
  name: string;
  campaigns: number;
  budgetCents: number;
  totalImpressions: number;
  fillRatePct: number;
  invoicedCents: number;
  paidCents: number;
};

async function buildAdvertiserEngagement(
  period: ReportPeriod,
): Promise<Buffer> {
  const start = startOfDay(period.start);
  const end = endOfDay(period.end);
  const startDateStr = toIsoDate(start);
  const endDateStr = toIsoDate(end);

  // Active or running campaigns whose window overlaps the period.
  const [campaigns, companies, invoices, impressions] = await Promise.all([
    db
      .collection(Collections.campaigns)
      .find({
        startDate: { $lte: end },
        endDate: { $gte: start },
      })
      .toArray() as Promise<CampaignDoc[]>,
    db
      .collection(Collections.companies)
      .find({})
      .project({ companyName: 1 })
      .toArray() as Promise<Pick<CompanyDoc, "_id" | "companyName">[]>,
    db
      .collection(Collections.invoices)
      .find({ issueDate: { $gte: start, $lte: end } })
      .toArray() as Promise<InvoiceDoc[]>,
    db
      .collection(Collections.adImpressionsDaily)
      .find({ date: { $gte: startDateStr, $lte: endDateStr } })
      .toArray() as Promise<AdImpressionDailyDoc[]>,
  ]);

  const companyMap = new Map(
    companies.map((c) => [c._id!.toString(), c.companyName]),
  );

  const impressionsByCampaign = new Map<string, number>();
  impressions.forEach((i) =>
    impressionsByCampaign.set(
      i.campaignId,
      (impressionsByCampaign.get(i.campaignId) ?? 0) + i.impressions,
    ),
  );

  const byCompany = new Map<string, Row>();
  for (const c of campaigns) {
    const id = c.companyId;
    if (!byCompany.has(id)) {
      byCompany.set(id, {
        companyId: id,
        name: companyMap.get(id) ?? id,
        campaigns: 0,
        budgetCents: 0,
        totalImpressions: 0,
        fillRatePct: 0,
        invoicedCents: 0,
        paidCents: 0,
      });
    }
    const row = byCompany.get(id)!;
    row.campaigns += 1;
    row.budgetCents += c.budgetCents;
    row.totalImpressions +=
      impressionsByCampaign.get(c._id!.toString()) ?? 0;
  }

  // Fill rate = mean of (driversAssigned / driversNeeded) across flocage
  // campaigns + (impressions / targetImpressions) across borne campaigns.
  // Companies with no signal default to 0 to keep rendering stable.
  for (const c of campaigns) {
    const row = byCompany.get(c.companyId);
    if (!row) continue;
    if (c.campaignType === "flocage" && c.driversNeeded > 0) {
      row.fillRatePct +=
        (Math.min(c.driversAssigned, c.driversNeeded) / c.driversNeeded) *
        100;
    } else if (
      c.campaignType === "borne" &&
      c.borne?.targetImpressions &&
      c.borne.targetImpressions > 0
    ) {
      const got = impressionsByCampaign.get(c._id!.toString()) ?? 0;
      row.fillRatePct +=
        (Math.min(got, c.borne.targetImpressions) / c.borne.targetImpressions) *
        100;
    }
  }
  byCompany.forEach((row) => {
    row.fillRatePct =
      row.campaigns > 0 ? Math.round(row.fillRatePct / row.campaigns) : 0;
  });

  for (const inv of invoices) {
    const row = byCompany.get(inv.companyId);
    if (!row) {
      // Company with billing but no campaign in period — still show.
      byCompany.set(inv.companyId, {
        companyId: inv.companyId,
        name: companyMap.get(inv.companyId) ?? inv.companyId,
        campaigns: 0,
        budgetCents: 0,
        totalImpressions: 0,
        fillRatePct: 0,
        invoicedCents: inv.totalCents,
        paidCents: inv.status === "payee" ? inv.totalCents : 0,
      });
      continue;
    }
    row.invoicedCents += inv.totalCents;
    if (inv.status === "payee") row.paidCents += inv.totalCents;
  }

  const rows = [...byCompany.values()].sort(
    (a, b) => b.invoicedCents - a.invoicedCents,
  );

  const totalCampaigns = campaigns.length;
  const totalImpressions = rows.reduce((a, r) => a + r.totalImpressions, 0);
  const totalInvoiced = rows.reduce((a, r) => a + r.invoicedCents, 0);
  const totalPaid = rows.reduce((a, r) => a + r.paidCents, 0);

  const { doc, finish } = createReportDoc();
  drawHeader(doc, "Rapport annonceurs", period);

  drawSectionTitle(doc, "Synthèse");
  drawKeyValues(doc, [
    { label: "Annonceurs avec activité", value: fmtNumber(rows.length) },
    { label: "Campagnes en cours", value: fmtNumber(totalCampaigns) },
    { label: "Impressions cumulées", value: fmtNumber(totalImpressions) },
    { label: "Total facturé", value: eur(totalInvoiced) },
    { label: "Total encaissé", value: eur(totalPaid) },
  ]);

  doc.moveDown(0.5);
  drawSectionTitle(doc, "Détail par annonceur");
  if (rows.length === 0) {
    doc.fontSize(9).fillColor("#666").text("Aucun annonceur actif sur la période.");
  } else {
    drawTable(
      doc,
      [
        { header: "Annonceur", width: 170, render: (r: Row) => r.name },
        {
          header: "Camp.",
          width: 45,
          render: (r: Row) => fmtNumber(r.campaigns),
          align: "right",
        },
        {
          header: "Budget",
          width: 75,
          render: (r: Row) => eur(r.budgetCents),
          align: "right",
        },
        {
          header: "Imp.",
          width: 60,
          render: (r: Row) => fmtNumber(r.totalImpressions),
          align: "right",
        },
        {
          header: "Remplissage",
          width: 70,
          render: (r: Row) => `${r.fillRatePct}%`,
          align: "right",
        },
        {
          header: "Encaissé",
          width: 75,
          render: (r: Row) => eur(r.paidCents),
          align: "right",
        },
      ],
      rows,
    );
  }

  return finish();
}

export const advertiserEngagementBuilder: ReportBuilder = {
  type: "advertiser_engagement",
  async build(period) {
    const buffer = await buildAdvertiserEngagement(period);
    return {
      buffer,
      filename: `rapport-annonceurs-${formatPeriodSlug(period)}.pdf`,
      contentType: "application/pdf",
      format: "pdf",
    };
  },
};
