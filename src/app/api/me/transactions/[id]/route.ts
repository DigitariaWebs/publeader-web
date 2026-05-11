import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type CampaignDoc,
  type TransactionDoc,
  type WithdrawalDoc,
} from "@/lib/schemas";
import { requireDriver } from "@/lib/session";
import { serializeTransaction } from "@/lib/transaction-serializer";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireDriver(req.headers);
  if (!auth.ok) return auth.response;
  const { driver } = auth;

  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const tx = (await db
    .collection(Collections.transactions)
    .findOne({ _id: new ObjectId(id) })) as TransactionDoc | null;

  if (!tx) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (tx.driverId !== driver._id!.toString()) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Build a small timeline for UI based on type.
  const timeline: { label: string; date: string }[] = [];
  const context: {
    campaign?: { id: string; title: string; brand: string; endDate: string };
    withdrawal?: {
      id: string;
      status: string;
      processedAt?: string;
      payoutReference?: string;
      rejectReason?: string;
    };
  } = {};

  if (tx.type === "campaign_completion" && tx.campaignId) {
    const c = (await db
      .collection(Collections.campaigns)
      .findOne({ _id: new ObjectId(tx.campaignId) })) as CampaignDoc | null;
    if (c) {
      context.campaign = {
        id: tx.campaignId,
        title: c.title,
        brand: c.brand,
        endDate: c.endDate.toISOString(),
      };
      timeline.push({
        label: "Campagne terminée",
        date: c.endDate.toISOString(),
      });
    }
    timeline.push({
      label: "Paiement initié (en attente)",
      date: tx.createdAt.toISOString(),
    });
    if (tx.tier === "available" || new Date() >= tx.availableAt) {
      timeline.push({
        label: "Paiement disponible",
        date: tx.availableAt.toISOString(),
      });
    }
  } else if (tx.type === "withdrawal_debit" && tx.withdrawalId) {
    const w = (await db
      .collection(Collections.withdrawals)
      .findOne({ _id: new ObjectId(tx.withdrawalId) })) as WithdrawalDoc | null;
    if (w) {
      context.withdrawal = {
        id: tx.withdrawalId,
        status: w.status,
        processedAt: w.processedAt?.toISOString(),
        payoutReference: w.payoutReference,
        rejectReason: w.rejectReason,
      };
      timeline.push({
        label: "Demande de retrait",
        date: w.createdAt.toISOString(),
      });
      if (w.status === "paid" && w.processedAt) {
        timeline.push({
          label: "Virement effectué",
          date: w.processedAt.toISOString(),
        });
      }
      if (w.status === "rejected" && w.processedAt) {
        timeline.push({
          label: "Demande rejetée",
          date: w.processedAt.toISOString(),
        });
      }
    }
  }

  return NextResponse.json({
    transaction: serializeTransaction(tx),
    timeline,
    context,
  });
}
