import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { InvoiceError, getInvoiceWithCompany } from "@/lib/invoice-service";
import { buildInvoicePDF } from "@/lib/invoice-pdf";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_company: 400,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const { invoice, company } = await getInvoiceWithCompany(id);
    const pdf = await buildInvoicePDF({ invoice, company });
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.ref}.pdf"`,
        "Cache-Control": "no-store",
      },
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
