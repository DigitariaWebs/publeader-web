import JSZip from "jszip";
import { ObjectId } from "mongodb";
import { db } from "../../db";
import {
  Collections,
  EXPENSE_CATEGORY_LABELS,
  type CampaignDoc,
  type CompanyDoc,
  type DriverDoc,
  type ExpenseDoc,
  type InvoiceDoc,
  type TransactionDoc,
} from "../../schemas";
import {
  endOfDay,
  formatPeriodSlug,
  startOfDay,
  type ReportBuilder,
  type ReportPeriod,
} from "../types";

// CSV cell escaping per RFC 4180. Wraps cells with comma/quote/newline in
// double quotes, doubling embedded quotes. We always force quoting on string
// columns to keep Excel happy with European number formats.
function csvCell(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  const s = String(v);
  const needsQuote = /[",\n;]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : s;
}

function csvRow(cells: (string | number | undefined | null)[]): string {
  return cells.map(csvCell).join(",");
}

function eurStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isoDate(d: Date | string | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

async function buildInvoicesCsv(start: Date, end: Date): Promise<string> {
  const invoices = (await db
    .collection(Collections.invoices)
    .find({ issueDate: { $gte: start, $lte: end } })
    .sort({ issueDate: 1 })
    .toArray()) as InvoiceDoc[];

  const companyIds = Array.from(
    new Set(invoices.map((i) => i.companyId).filter((id) => ObjectId.isValid(id))),
  );
  const companies = companyIds.length
    ? ((await db
        .collection(Collections.companies)
        .find({ _id: { $in: companyIds.map((id) => new ObjectId(id)) } })
        .project({ companyName: 1, siret: 1, vatNumber: 1 })
        .toArray()) as Pick<
        CompanyDoc,
        "_id" | "companyName" | "siret" | "vatNumber"
      >[])
    : [];
  const companyMap = new Map(companies.map((c) => [c._id!.toString(), c]));

  const lines: string[] = [];
  lines.push(
    csvRow([
      "ref",
      "issue_date",
      "due_date",
      "company_name",
      "company_siret",
      "company_vat",
      "status",
      "subtotal_eur",
      "tax_eur",
      "total_eur",
      "paid_at",
      "paid_via",
      "paid_reference",
    ]),
  );
  for (const inv of invoices) {
    const c = companyMap.get(inv.companyId);
    lines.push(
      csvRow([
        inv.ref,
        isoDate(inv.issueDate),
        isoDate(inv.dueDate),
        c?.companyName ?? inv.companyId,
        c?.siret ?? "",
        c?.vatNumber ?? "",
        inv.status,
        eurStr(inv.subtotalCents),
        eurStr(inv.taxCents),
        eurStr(inv.totalCents),
        isoDate(inv.paidAt),
        inv.paidVia ?? "",
        inv.paidReference ?? "",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

async function buildCommissionsCsv(start: Date, end: Date): Promise<string> {
  const txs = (await db
    .collection(Collections.transactions)
    .find({
      type: "campaign_completion",
      createdAt: { $gte: start, $lte: end },
    })
    .sort({ createdAt: 1 })
    .toArray()) as TransactionDoc[];

  const driverIds = Array.from(new Set(txs.map((t) => t.driverId)));
  const campaignIds = Array.from(
    new Set(txs.map((t) => t.campaignId).filter(Boolean) as string[]),
  );
  const [drivers, campaigns] = await Promise.all([
    driverIds.length
      ? (db
          .collection(Collections.drivers)
          .find({ _id: { $in: driverIds.map((id) => new ObjectId(id)) } })
          .project({ firstName: 1, lastName: 1 })
          .toArray() as Promise<Pick<DriverDoc, "_id" | "firstName" | "lastName">[]>)
      : Promise.resolve([]),
    campaignIds.length
      ? (db
          .collection(Collections.campaigns)
          .find({ _id: { $in: campaignIds.map((id) => new ObjectId(id)) } })
          .project({ title: 1, brand: 1 })
          .toArray() as Promise<Pick<CampaignDoc, "_id" | "title" | "brand">[]>)
      : Promise.resolve([]),
  ]);
  const driverMap = new Map(drivers.map((d) => [d._id!.toString(), d]));
  const campaignMap = new Map(campaigns.map((c) => [c._id!.toString(), c]));

  const lines: string[] = [];
  lines.push(
    csvRow([
      "transaction_id",
      "driver_id",
      "driver_name",
      "campaign_id",
      "campaign_title",
      "brand",
      "amount_eur",
      "tier",
      "created_at",
      "available_at",
    ]),
  );
  for (const t of txs) {
    const d = driverMap.get(t.driverId);
    const c = t.campaignId ? campaignMap.get(t.campaignId) : undefined;
    lines.push(
      csvRow([
        t._id!.toString(),
        t.driverId,
        d ? `${d.firstName} ${d.lastName}` : t.driverId,
        t.campaignId ?? "",
        c?.title ?? "",
        c?.brand ?? "",
        eurStr(t.amountCents),
        t.tier,
        isoDate(t.createdAt),
        isoDate(t.availableAt),
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

async function buildExpensesCsv(start: Date, end: Date): Promise<string> {
  const expenses = (await db
    .collection(Collections.expenses)
    .find({ expenseDate: { $gte: start, $lte: end } })
    .sort({ expenseDate: 1 })
    .toArray()) as ExpenseDoc[];

  const lines: string[] = [];
  lines.push(
    csvRow([
      "expense_id",
      "label",
      "category",
      "category_label",
      "vendor",
      "amount_eur",
      "expense_date",
      "notes",
    ]),
  );
  for (const e of expenses) {
    lines.push(
      csvRow([
        e._id!.toString(),
        e.label,
        e.category,
        EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
        e.vendor ?? "",
        eurStr(e.amountCents),
        isoDate(e.expenseDate),
        e.notes ?? "",
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

async function buildAccountingZip(period: ReportPeriod): Promise<Buffer> {
  const start = startOfDay(period.start);
  const end = endOfDay(period.end);

  const [invoicesCsv, commissionsCsv, expensesCsv] = await Promise.all([
    buildInvoicesCsv(start, end),
    buildCommissionsCsv(start, end),
    buildExpensesCsv(start, end),
  ]);

  const zip = new JSZip();
  // BOM prefix on every CSV so Excel detects UTF-8 and renders accents
  // correctly without manual import.
  const BOM = "﻿";
  zip.file("invoices.csv", BOM + invoicesCsv);
  zip.file("commissions.csv", BOM + commissionsCsv);
  zip.file("expenses.csv", BOM + expensesCsv);

  return zip.generateAsync({ type: "nodebuffer" });
}

export const accountingExportBuilder: ReportBuilder = {
  type: "accounting_export",
  async build(period) {
    const buffer = await buildAccountingZip(period);
    return {
      buffer,
      filename: `export-comptable-${formatPeriodSlug(period)}.zip`,
      contentType: "application/zip",
      format: "zip",
    };
  },
};
