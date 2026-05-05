import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import { Collections, type CampaignDoc } from "@/lib/schemas";
import { requireDriver } from "@/lib/session";
import { applyExpectedStatus, syncStatusToDb } from "@/lib/campaign-lifecycle";
import { serializeCampaign } from "@/lib/campaign-serializer";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const auth = await requireDriver(req.headers);
  if (!auth.ok) return auth.response;
  const { driver } = auth;

  if (driver.status !== "validated") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const doc = (await db
    .collection(Collections.campaigns)
    .findOne({ _id: new ObjectId(id) })) as CampaignDoc | null;

  if (!doc) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Driver may only see campaigns in their city, unless they're already assigned.
  const isAssigned = doc.assignedDriverIds.includes(auth.user.driverId!);
  if (doc.city !== driver.city && !isAssigned) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const reconciled = applyExpectedStatus(doc);
  if (reconciled.status !== doc.status) {
    syncStatusToDb(
      doc._id!,
      doc.status,
      reconciled.status,
      doc.assignedDriverIds,
    );
  }

  return NextResponse.json({ campaign: serializeCampaign(reconciled) });
}
