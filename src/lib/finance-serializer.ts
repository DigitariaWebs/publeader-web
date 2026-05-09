import type { ExpenseDoc, InvoiceLine } from "./schemas";
import type { InvoiceView } from "./invoice-service";

export type InvoiceLineDTO = InvoiceLine;

export type InvoiceDTO = {
  id: string;
  ref: string;
  companyId: string;
  companyName?: string;
  campaignId?: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLineDTO[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: InvoiceView["status"];
  storedStatus: InvoiceView["storedStatus"];
  sentAt?: string;
  sentTo?: string;
  paidAt?: string;
  paidVia?: string;
  paidReference?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function serializeInvoice(
  inv: InvoiceView,
  companyName?: string,
): InvoiceDTO {
  return {
    id: inv._id!.toString(),
    ref: inv.ref,
    companyId: inv.companyId,
    companyName,
    campaignId: inv.campaignId,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    lines: inv.lines,
    subtotalCents: inv.subtotalCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    status: inv.status,
    storedStatus: inv.storedStatus,
    sentAt: inv.sentAt?.toISOString(),
    sentTo: inv.sentTo,
    paidAt: inv.paidAt?.toISOString(),
    paidVia: inv.paidVia,
    paidReference: inv.paidReference,
    notes: inv.notes,
    createdBy: inv.createdBy,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

export type ExpenseDTO = {
  id: string;
  label: string;
  category: ExpenseDoc["category"];
  amountCents: number;
  vendor?: string;
  expenseDate: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function serializeExpense(e: ExpenseDoc): ExpenseDTO {
  return {
    id: e._id!.toString(),
    label: e.label,
    category: e.category,
    amountCents: e.amountCents,
    vendor: e.vendor,
    expenseDate: e.expenseDate.toISOString(),
    notes: e.notes,
    createdBy: e.createdBy,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
