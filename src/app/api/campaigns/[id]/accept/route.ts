import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { Collections, type CampaignDoc } from "@/lib/schemas";
import { requireDriver } from "@/lib/session";
import { expectedStatus, syncStatusToDb } from "@/lib/campaign-lifecycle";
import { serializeCampaign } from "@/lib/campaign-serializer";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const auth = await requireDriver(req.headers);
  if (!auth.ok) return auth.response;
  const { driver, user } = auth;

  if (driver.status !== "validated") {
    return NextResponse.json(
      { error: "driver not validated" },
      { status: 403 },
    );
  }

  const driverId = user.driverId!;

  // Pre-read: check city match + lifecycle expectations.
  const existing = (await db
    .collection(Collections.campaigns)
    .findOne({ _id: new ObjectId(id) })) as CampaignDoc | null;

  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (existing.city !== driver.city) {
    return NextResponse.json(
      { error: "campaign not in your city" },
      { status: 403 },
    );
  }

  const liveStatus = expectedStatus(existing);
  if (liveStatus !== "upcoming" && liveStatus !== "active") {
    return NextResponse.json(
      { error: `campaign ${liveStatus}, cannot accept` },
      { status: 409 },
    );
  }

  // Atomic claim: matches only if capacity left AND driver not already in.
  // Filter on stored status (covers both upcoming/active) so write succeeds
  // regardless of pending lifecycle reconciliation.
  const result = await db
    .collection<CampaignDoc>(Collections.campaigns)
    .findOneAndUpdate(
      {
        _id: new ObjectId(id),
        status: { $in: ["upcoming", "active"] },
        $expr: { $lt: ["$driversAssigned", "$driversNeeded"] },
        assignedDriverIds: { $ne: driverId },
      },
      {
        $inc: { driversAssigned: 1 },
        $push: { assignedDriverIds: driverId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );

  if (!result) {
    // Diagnose why
    const refetch = (await db
      .collection(Collections.campaigns)
      .findOne({ _id: new ObjectId(id) })) as CampaignDoc | null;
    if (!refetch) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (refetch.assignedDriverIds.includes(driverId)) {
      return NextResponse.json(
        { error: "already accepted" },
        { status: 409 },
      );
    }
    if (refetch.driversAssigned >= refetch.driversNeeded) {
      return NextResponse.json({ error: "campaign full" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "cannot accept campaign" },
      { status: 409 },
    );
  }

  const updated = result as unknown as CampaignDoc;

  // Audit event (best-effort).
  db.collection(Collections.campaignEvents)
    .insertOne({
      campaignId: id,
      type: "accept",
      driverId,
      at: new Date(),
      meta: {
        capacityBefore: updated.driversAssigned - 1,
        capacityAfter: updated.driversAssigned,
        capacityTotal: updated.driversNeeded,
        driverCity: driver.city,
        campaignCity: updated.city,
      },
    })
    .catch((e) => console.warn("[accept] audit insert failed", e));

  // Reconcile status to live value if needed.
  const next = expectedStatus(updated);
  if (next !== updated.status) {
    syncStatusToDb(
      updated._id!,
      updated.status,
      next,
      updated.assignedDriverIds,
    );
    updated.status = next;
  }

  return NextResponse.json({ campaign: serializeCampaign(updated) });
}
