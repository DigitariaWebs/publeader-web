import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  INVOICE_DUE_DAYS_DEFAULT,
  INVOICE_VAT_RATE,
  type CompanyDoc,
  type InvoiceDoc,
  type InvoiceLine,
  type InvoiceStatus,
  type InvoiceStoredStatus,
} from "./schemas";

export class InvoiceError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_status_transition"
      | "invalid_company"
      | "invalid_line"
      | "missing_email",
    message: string,
  ) {
    super(message);
    this.name = "InvoiceError";
  }
}

export type InvoiceLineInput = {
  label: string;
  qty: number;
  unitCents: number;
};

export type CreateInvoiceInput = {
  companyId: string;
  campaignId?: string;
  issueDate?: Date;
  dueDate?: Date;
  lines: InvoiceLineInput[];
  taxCents?: number; // explicit override; else 20% on subtotal
  notes?: string;
};

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

// Computed view: en_retard derived from envoyee + dueDate < now.
export type InvoiceView = Omit<InvoiceDoc, "status"> & {
  status: InvoiceStatus;
  storedStatus: InvoiceStoredStatus;
};

// Atomic per-year sequence counter stored in app_config.
type InvoiceCounterDoc = {
  _id?: ObjectId;
  key: "invoice_seq";
  year: number;
  seq: number;
  updatedAt: Date;
};

async function nextInvoiceRef(now: Date): Promise<string> {
  const year = now.getUTCFullYear();
  const result = await db
    .collection<InvoiceCounterDoc>(Collections.appConfig)
    .findOneAndUpdate(
      { key: "invoice_seq", year },
      {
        $inc: { seq: 1 },
        $setOnInsert: { key: "invoice_seq", year },
        $set: { updatedAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );
  const seq = result?.seq ?? 1;
  return `F-${year}-${String(seq).padStart(4, "0")}`;
}

function normalizeLines(input: InvoiceLineInput[]): InvoiceLine[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new InvoiceError("invalid_line", "at least one line required");
  }
  return input.map((l, i) => {
    const label = (l.label ?? "").trim();
    if (!label)
      throw new InvoiceError("invalid_line", `line ${i + 1}: label required`);
    const qty = Number(l.qty);
    const unitCents = Math.round(Number(l.unitCents));
    if (!Number.isFinite(qty) || qty <= 0)
      throw new InvoiceError("invalid_line", `line ${i + 1}: qty must be > 0`);
    if (!Number.isFinite(unitCents) || unitCents < 0)
      throw new InvoiceError(
        "invalid_line",
        `line ${i + 1}: unitCents must be >= 0`,
      );
    return {
      label,
      qty,
      unitCents,
      totalCents: Math.round(qty * unitCents),
    };
  });
}

function computeTotals(lines: InvoiceLine[], taxCentsOverride?: number) {
  const subtotalCents = lines.reduce((a, l) => a + l.totalCents, 0);
  const taxCents =
    taxCentsOverride !== undefined
      ? Math.max(0, Math.round(taxCentsOverride))
      : Math.round(subtotalCents * INVOICE_VAT_RATE);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

function withDerivedStatus(doc: InvoiceDoc, now: Date = new Date()): InvoiceView {
  const stored = doc.status;
  const isLate =
    stored === "envoyee" && doc.dueDate && doc.dueDate.getTime() < now.getTime();
  return {
    ...doc,
    status: isLate ? "en_retard" : stored,
    storedStatus: stored,
  };
}

export async function createInvoice(
  adminId: string,
  input: CreateInvoiceInput,
): Promise<InvoiceView> {
  const company = (await db
    .collection(Collections.companies)
    .findOne({ _id: new ObjectId(input.companyId) })) as CompanyDoc | null;
  if (!company) throw new InvoiceError("invalid_company", "company not found");

  const lines = normalizeLines(input.lines);
  const totals = computeTotals(lines, input.taxCents);
  const now = new Date();
  const issueDate = input.issueDate ?? now;
  const dueDate =
    input.dueDate ??
    new Date(issueDate.getTime() + INVOICE_DUE_DAYS_DEFAULT * 86_400_000);

  const ref = await nextInvoiceRef(now);

  const doc: InvoiceDoc = {
    ref,
    companyId: input.companyId,
    campaignId: input.campaignId,
    issueDate,
    dueDate,
    lines,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    status: "brouillon",
    notes: input.notes?.trim() || undefined,
    createdBy: adminId,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(Collections.invoices).insertOne(doc);
  return withDerivedStatus({ ...doc, _id: result.insertedId });
}

export async function listInvoices(filter: {
  status?: InvoiceStatus;
  companyId?: string;
  campaignId?: string;
} = {}): Promise<InvoiceView[]> {
  const q: Record<string, unknown> = {};
  if (filter.companyId) q.companyId = filter.companyId;
  if (filter.campaignId) q.campaignId = filter.campaignId;
  if (filter.status) {
    if (filter.status === "en_retard") {
      q.status = "envoyee";
      q.dueDate = { $lt: new Date() };
    } else {
      q.status = filter.status;
    }
  }
  const docs = (await db
    .collection(Collections.invoices)
    .find(q)
    .sort({ issueDate: -1, createdAt: -1 })
    .toArray()) as InvoiceDoc[];
  const now = new Date();
  return docs.map((d) => withDerivedStatus(d, now));
}

export async function getInvoice(id: string): Promise<InvoiceView> {
  if (!ObjectId.isValid(id)) throw new InvoiceError("not_found", "invoice not found");
  const doc = (await db
    .collection(Collections.invoices)
    .findOne({ _id: new ObjectId(id) })) as InvoiceDoc | null;
  if (!doc) throw new InvoiceError("not_found", "invoice not found");
  return withDerivedStatus(doc);
}

export async function updateInvoice(
  id: string,
  patch: UpdateInvoiceInput,
): Promise<InvoiceView> {
  const current = await getInvoice(id);
  if (current.storedStatus !== "brouillon") {
    throw new InvoiceError(
      "invalid_status_transition",
      "only draft invoices can be edited",
    );
  }

  const $set: Partial<InvoiceDoc> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (patch.companyId !== undefined) {
    const company = (await db
      .collection(Collections.companies)
      .findOne({ _id: new ObjectId(patch.companyId) })) as CompanyDoc | null;
    if (!company) throw new InvoiceError("invalid_company", "company not found");
    $set.companyId = patch.companyId;
  }
  if (patch.campaignId !== undefined) $set.campaignId = patch.campaignId || undefined;
  if (patch.issueDate !== undefined) $set.issueDate = patch.issueDate;
  if (patch.dueDate !== undefined) $set.dueDate = patch.dueDate;
  if (patch.notes !== undefined) $set.notes = patch.notes.trim() || undefined;

  if (patch.lines !== undefined || patch.taxCents !== undefined) {
    const lines = patch.lines ? normalizeLines(patch.lines) : current.lines;
    const totals = computeTotals(
      lines,
      patch.taxCents !== undefined ? patch.taxCents : current.taxCents,
    );
    $set.lines = lines;
    $set.subtotalCents = totals.subtotalCents;
    $set.taxCents = totals.taxCents;
    $set.totalCents = totals.totalCents;
  }

  await db
    .collection(Collections.invoices)
    .updateOne({ _id: new ObjectId(id) }, { $set });

  return getInvoice(id);
}

export async function deleteInvoice(id: string): Promise<void> {
  const current = await getInvoice(id);
  if (current.storedStatus !== "brouillon") {
    throw new InvoiceError(
      "invalid_status_transition",
      "only draft invoices can be deleted",
    );
  }
  await db
    .collection(Collections.invoices)
    .deleteOne({ _id: new ObjectId(id) });
}

export async function markInvoiceSent(
  id: string,
  email?: string,
): Promise<InvoiceView> {
  const current = await getInvoice(id);
  if (current.storedStatus !== "brouillon") {
    throw new InvoiceError(
      "invalid_status_transition",
      "only draft invoices can be sent",
    );
  }
  const now = new Date();
  await db.collection(Collections.invoices).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "envoyee",
        sentAt: now,
        sentTo: email,
        updatedAt: now,
      },
    },
  );
  return getInvoice(id);
}

export async function markInvoicePaid(
  id: string,
  paidVia?: string,
  paidReference?: string,
): Promise<InvoiceView> {
  const current = await getInvoice(id);
  if (
    current.storedStatus !== "envoyee" &&
    current.storedStatus !== "brouillon"
  ) {
    throw new InvoiceError(
      "invalid_status_transition",
      "invoice must be sent or draft to be marked paid",
    );
  }
  const now = new Date();
  await db.collection(Collections.invoices).updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "payee",
        paidAt: now,
        paidVia: paidVia,
        paidReference: paidReference,
        updatedAt: now,
      },
    },
  );
  return getInvoice(id);
}

export async function getInvoiceWithCompany(
  id: string,
): Promise<{ invoice: InvoiceView; company: CompanyDoc }> {
  const invoice = await getInvoice(id);
  const company = (await db
    .collection(Collections.companies)
    .findOne({ _id: new ObjectId(invoice.companyId) })) as CompanyDoc | null;
  if (!company) throw new InvoiceError("invalid_company", "company not found");
  return { invoice, company };
}
