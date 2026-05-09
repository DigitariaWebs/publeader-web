import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc, type InvoiceStatus } from "@/lib/schemas";
import {
  InvoiceError,
  createInvoice,
  listInvoices,
  type CreateInvoiceInput,
} from "@/lib/invoice-service";
import { serializeInvoice } from "@/lib/finance-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_status_transition: 409,
  invalid_company: 400,
  invalid_line: 400,
  missing_email: 400,
};

const VALID_STATUSES: InvoiceStatus[] = [
  "brouillon",
  "envoyee",
  "payee",
  "en_retard",
];

async function attachCompanyNames<T extends { companyId: string }>(
  rows: T[],
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(rows.map((r) => r.companyId)));
  if (ids.length === 0) return new Map();
  const companies = (await db
    .collection(Collections.companies)
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .project({ companyName: 1 })
    .toArray()) as Pick<CompanyDoc, "_id" | "companyName">[];
  return new Map(companies.map((c) => [c._id!.toString(), c.companyName]));
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as InvoiceStatus)
      ? (statusParam as InvoiceStatus)
      : undefined;

  const invoices = await listInvoices({ status, companyId, campaignId });
  const nameMap = await attachCompanyNames(invoices);

  return NextResponse.json({
    invoices: invoices.map((i) =>
      serializeInvoice(i, nameMap.get(i.companyId)),
    ),
  });
}

type PostBody = {
  companyId: string;
  campaignId?: string;
  issueDate?: string;
  dueDate?: string;
  lines: { label: string; qty: number; unitCents: number }[];
  taxCents?: number;
  notes?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const input: CreateInvoiceInput = {
    companyId: body.companyId,
    campaignId: body.campaignId,
    issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    lines: body.lines,
    taxCents: body.taxCents,
    notes: body.notes,
  };
  try {
    const invoice = await createInvoice(auth.user.id, input);
    const nameMap = await attachCompanyNames([invoice]);
    return NextResponse.json(
      { invoice: serializeInvoice(invoice, nameMap.get(invoice.companyId)) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof InvoiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
