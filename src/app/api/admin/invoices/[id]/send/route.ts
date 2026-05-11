import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { type CompanyDoc } from "@/lib/schemas";
import {
  InvoiceError,
  getInvoiceWithCompany,
  markInvoiceSent,
} from "@/lib/invoice-service";
import { serializeInvoice } from "@/lib/finance-serializer";
import { buildInvoicePDF } from "@/lib/invoice-pdf";
import { sendMail } from "@/lib/mailer";
import { actorFromSession, recordAudit } from "@/lib/audit-service";

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
    const { company } = await getInvoiceWithCompany(id);
    const recipient = body.email || (await resolveContactEmail(company));
    if (!recipient) {
      throw new InvoiceError(
        "missing_email",
        "no recipient email — pass `email` in body or set company contact",
      );
    }

    const updated = await markInvoiceSent(id, recipient);
    const pdf = await buildInvoicePDF({ invoice: updated, company });

    const site =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    // Link points at our redirect endpoint so each click mints a fresh
    // Stripe Checkout Session — emails stay valid past Checkout's 24h TTL.
    const payUrl = `${site}/api/pay/${updated._id!.toString()}/redirect`;
    const stripeAvailable = !!process.env.STRIPE_SECRET_KEY;

    const defaultText = stripeAvailable
      ? `Bonjour,\n\nVeuillez trouver ci-joint la facture ${updated.ref} d'un montant de ${eur(updated.totalCents)}.\n\nÉchéance : ${updated.dueDate.toLocaleDateString("fr-FR")}.\n\nPour régler en ligne par carte bancaire :\n${payUrl}\n\nCordialement,\nPubleader`
      : `Bonjour,\n\nVeuillez trouver ci-joint la facture ${updated.ref} d'un montant de ${eur(updated.totalCents)}.\n\nÉchéance : ${updated.dueDate.toLocaleDateString("fr-FR")}.\n\nCordialement,\nPubleader`;

    await sendMail({
      to: recipient,
      subject:
        body.subject ?? `Facture ${updated.ref} — ${eur(updated.totalCents)}`,
      text: body.message ?? defaultText,
      attachments: [
        {
          filename: `${updated.ref}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });

    await recordAudit({
      ...actorFromSession(auth.user),
      action: "invoice.send",
      targetType: "invoice",
      targetId: id,
      meta: { recipient, ref: updated.ref, totalCents: updated.totalCents },
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
