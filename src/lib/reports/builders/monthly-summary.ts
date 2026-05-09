import { db } from "../../db";
import {
  Collections,
  type CampaignDoc,
  type CompanyDoc,
  type ExpenseDoc,
  type InvoiceDoc,
  type TransactionDoc,
} from "../../schemas";
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
import { ObjectId } from "mongodb";

async function buildMonthlySummary(period: ReportPeriod): Promise<Buffer> {
  const start = startOfDay(period.start);
  const end = endOfDay(period.end);

  const [paidInvoices, expenses, commissionTxs, campaigns] = await Promise.all([
    db
      .collection(Collections.invoices)
      .find({ status: "payee", paidAt: { $gte: start, $lte: end } })
      .toArray() as Promise<InvoiceDoc[]>,
    db
      .collection(Collections.expenses)
      .find({ expenseDate: { $gte: start, $lte: end } })
      .toArray() as Promise<ExpenseDoc[]>,
    db
      .collection(Collections.transactions)
      .find({
        type: "campaign_completion",
        createdAt: { $gte: start, $lte: end },
      })
      .toArray() as Promise<TransactionDoc[]>,
    db
      .collection(Collections.campaigns)
      .find({
        startDate: { $lte: end },
        endDate: { $gte: start },
      })
      .toArray() as Promise<CampaignDoc[]>,
  ]);

  const totalRevenueCents = paidInvoices.reduce(
    (a, i) => a + i.totalCents,
    0,
  );
  const totalExpensesCents = expenses.reduce((a, e) => a + e.amountCents, 0);
  const totalCommissionsCents = commissionTxs.reduce(
    (a, t) => a + Math.max(0, t.amountCents),
    0,
  );
  const netCents =
    totalRevenueCents - totalExpensesCents - totalCommissionsCents;
  const activeDriverCount = new Set(commissionTxs.map((t) => t.driverId)).size;

  // Top 5 advertisers by paid invoice total in period.
  const byCompany = new Map<string, number>();
  paidInvoices.forEach((i) =>
    byCompany.set(i.companyId, (byCompany.get(i.companyId) ?? 0) + i.totalCents),
  );
  const topCompanyIds = [...byCompany.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
    .filter((id) => ObjectId.isValid(id));
  const companies = topCompanyIds.length
    ? ((await db
        .collection(Collections.companies)
        .find({ _id: { $in: topCompanyIds.map((id) => new ObjectId(id)) } })
        .toArray()) as CompanyDoc[])
    : [];
  const companyMap = new Map(companies.map((c) => [c._id!.toString(), c]));
  const topAdvertisers = topCompanyIds.map((id) => ({
    name: companyMap.get(id)?.companyName ?? id,
    totalCents: byCompany.get(id) ?? 0,
  }));

  const { doc, finish } = createReportDoc();
  drawHeader(doc, "Bilan mensuel", period);

  drawSectionTitle(doc, "KPIs consolidés");
  drawKeyValues(doc, [
    { label: "Revenus encaissés", value: eur(totalRevenueCents) },
    { label: "Commissions chauffeurs", value: eur(totalCommissionsCents) },
    { label: "Dépenses internes", value: eur(totalExpensesCents) },
    { label: "Marge nette", value: eur(netCents) },
    { label: "Campagnes actives sur la période", value: fmtNumber(campaigns.length) },
    { label: "Chauffeurs actifs", value: fmtNumber(activeDriverCount) },
    { label: "Factures payées", value: fmtNumber(paidInvoices.length) },
  ]);

  doc.moveDown(1);
  drawSectionTitle(doc, "Top annonceurs (revenus encaissés)");
  if (topAdvertisers.length === 0) {
    doc.fontSize(9).fillColor("#666").text("Aucune facture payée sur la période.");
  } else {
    drawTable(
      doc,
      [
        { header: "Annonceur", width: 320, render: (r) => r.name },
        {
          header: "Total",
          width: 120,
          render: (r) => eur(r.totalCents),
          align: "right",
        },
      ],
      topAdvertisers,
    );
  }

  return finish();
}

export const monthlySummaryBuilder: ReportBuilder = {
  type: "monthly_summary",
  async build(period) {
    const buffer = await buildMonthlySummary(period);
    return {
      buffer,
      filename: `bilan-mensuel-${formatPeriodSlug(period)}.pdf`,
      contentType: "application/pdf",
      format: "pdf",
    };
  },
};
