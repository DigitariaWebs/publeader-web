import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc } from "@/lib/schemas";
import {
  InvoiceError,
  getInvoiceWithCompany,
  markInvoiceSent,
} from "@/lib/invoice-service";
import { serializeInvoice } from "@/lib/finance-serializer";
import { buildInvoicePDF } from "@/lib/invoice-pdf";
import { sendMail } from "@/lib/mailer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_status_transition: 409,
  invalid_company: 400,
  missing_email: 400,
};

type RouteCtx = { params: Promise<{ id: string }> };

type PostBody = {
  email?: string;
  subject?: string;
  message?: string;
};

async function resolveContactEmail(company: CompanyDoc): Promise<string | undefined> {
  if (!company.userId || !ObjectId.isValid(company.userId)) return undefined;
  const user = (await db
    .collection("user")
    .findOne(
      { _id: new ObjectId(company.userId) },
      { projection: { email: 1 } },
    )) as { email?: string } | null;
  return user?.email;
}

const eur = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

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
    const { invoice: current, company } = await getInvoiceWithCompany(id);
    const recipient = body.email || (await resolveContactEmail(company));
    if (!recipient) {
      throw new InvoiceError(
        "missing_email",
        "no recipient email — pass `email` in body or set company contact",
      );
    }

    const updated = await markInvoiceSent(id, recipient);
    const pdf = await buildInvoicePDF({ invoice: updated, company });

    await sendMail({
      to: recipient,
      subject:
        body.subject ?? `Facture ${updated.ref} — ${eur(updated.totalCents)}`,
      text:
        body.message ??
        `Bonjour,\n\nVeuillez trouver ci-joint la facture ${updated.ref} d'un montant de ${eur(updated.totalCents)}.\n\nÉchéance : ${updated.dueDate.toLocaleDateString("fr-FR")}.\n\nCordialement,\nPubleader`,
      attachments: [
        {
          filename: `${updated.ref}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({
      invoice: serializeInvoice(updated, company.companyName),
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
