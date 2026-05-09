import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc } from "@/lib/schemas";
import { InvoiceError, markInvoicePaid } from "@/lib/invoice-service";
import { serializeInvoice } from "@/lib/finance-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_status_transition: 409,
};

type RouteCtx = { params: Promise<{ id: string }> };

type PostBody = {
  paidVia?: string;
  paidReference?: string;
};

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: PostBody = {};
  try {
    body = (await req.json()) as PostBody;
  } catch {
    // empty body allowed
  }

  try {
    const invoice = await markInvoicePaid(id, body.paidVia, body.paidReference);
    let companyName: string | undefined;
    if (ObjectId.isValid(invoice.companyId)) {
      const c = (await db
        .collection(Collections.companies)
        .findOne(
          { _id: new ObjectId(invoice.companyId) },
          { projection: { companyName: 1 } },
        )) as Pick<CompanyDoc, "companyName"> | null;
      companyName = c?.companyName;
    }
    return NextResponse.json({ invoice: serializeInvoice(invoice, companyName) });
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
