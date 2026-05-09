import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc } from "@/lib/schemas";
import {
  InvoiceError,
  deleteInvoice,
  getInvoice,
  updateInvoice,
} from "@/lib/invoice-service";
import { serializeInvoice } from "@/lib/finance-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_status_transition: 409,
  invalid_company: 400,
  invalid_line: 400,
};

type RouteCtx = { params: Promise<{ id: string }> };

async function companyName(companyId: string): Promise<string | undefined> {
  if (!ObjectId.isValid(companyId)) return undefined;
  const c = (await db
    .collection(Collections.companies)
    .findOne({ _id: new ObjectId(companyId) }, { projection: { companyName: 1 } })) as
    | Pick<CompanyDoc, "companyName">
    | null;
  return c?.companyName;
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const invoice = await getInvoice(id);
    return NextResponse.json({
      invoice: serializeInvoice(invoice, await companyName(invoice.companyId)),
    });
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

type PatchBody = {
  companyId?: string;
  campaignId?: string;
  issueDate?: string;
  dueDate?: string;
  lines?: { label: string; qty: number; unitCents: number }[];
  taxCents?: number;
  notes?: string;
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const invoice = await updateInvoice(id, {
      companyId: body.companyId,
      campaignId: body.campaignId,
      issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      lines: body.lines,
      taxCents: body.taxCents,
      notes: body.notes,
    });
    return NextResponse.json({
      invoice: serializeInvoice(invoice, await companyName(invoice.companyId)),
    });
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

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    await deleteInvoice(id);
    return NextResponse.json({ ok: true });
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
