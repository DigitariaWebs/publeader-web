import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  type CampaignDoc,
  type DriverDoc,
  type TransactionDoc,
} from "./schemas";
import { effectiveTier, recomputeWallet } from "./wallet";

export class CommissionError extends Error {
  constructor(
    public readonly code: "not_found" | "already_settled" | "invalid_id",
    message: string,
  ) {
    super(message);
    this.name = "CommissionError";
  }
}

export type CommissionStatus = "pending" | "available";

export type CommissionRow = {
  id: string; // transaction _id
  driverId: string;
  driverName: string;
  campaignId?: string;
  campaignTitle?: string;
  campaignBrand?: string;
  km: number; // estimated per-driver km share
  amountCents: number;
  status: CommissionStatus;
  createdAt: string; // ISO
  availableAt: string; // ISO
};

export type CommissionsFilter = {
  status?: CommissionStatus;
  driverId?: string;
  campaignId?: string;
  from?: Date;
  to?: Date;
};

function perDriverKm(c: CampaignDoc | undefined): number {
  if (!c) return 0;
  const assigned = Math.max(c.driversAssigned ?? 0, 1);
  return Math.round((c.kmDone ?? 0) / assigned);
}

export async function listCommissions(
  filter: CommissionsFilter = {},
): Promise<CommissionRow[]> {
  const q: Record<string, unknown> = { type: "campaign_completion" };
  if (filter.driverId) q.driverId = filter.driverId;
  if (filter.campaignId) q.campaignId = filter.campaignId;
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.createdAt = range;
  }

  const txs = (await db
    .collection(Collections.transactions)
    .find(q)
    .sort({ createdAt: -1 })
    .toArray()) as TransactionDoc[];

  const driverIds = Array.from(new Set(txs.map((t) => t.driverId)));
  const campaignIds = Array.from(
    new Set(txs.map((t) => t.campaignId).filter(Boolean) as string[]),
  );

  const [drivers, campaigns] = await Promise.all([
    driverIds.length
      ? (db
          .collection(Collections.drivers)
          .find({
            _id: { $in: driverIds.map((id) => new ObjectId(id)) },
          })
          .toArray() as Promise<DriverDoc[]>)
      : Promise.resolve([] as DriverDoc[]),
    campaignIds.length
      ? (db
          .collection(Collections.campaigns)
          .find({
            _id: { $in: campaignIds.map((id) => new ObjectId(id)) },
          })
          .toArray() as Promise<CampaignDoc[]>)
      : Promise.resolve([] as CampaignDoc[]),
  ]);

  const driverMap = new Map(drivers.map((d) => [d._id!.toString(), d]));
  const campaignMap = new Map(campaigns.map((c) => [c._id!.toString(), c]));

  const now = new Date();
  const rows: CommissionRow[] = txs.map((t) => {
    const driver = driverMap.get(t.driverId);
    const campaign = t.campaignId ? campaignMap.get(t.campaignId) : undefined;
    const status = effectiveTier(t, now);
    return {
      id: t._id!.toString(),
      driverId: t.driverId,
      driverName: driver
        ? `${driver.firstName} ${driver.lastName}`
        : t.driverId,
      campaignId: t.campaignId,
      campaignTitle: campaign?.title,
      campaignBrand: campaign?.brand,
      km: perDriverKm(campaign),
      amountCents: t.amountCents,
      status,
      createdAt: t.createdAt.toISOString(),
      availableAt: t.availableAt.toISOString(),
    };
  });

  if (filter.status) return rows.filter((r) => r.status === filter.status);
  return rows;
}

export type SettleResult = {
  settled: string[]; // transaction ids flipped to available
  skipped: string[]; // already available or not found
};

export async function settleCommissions(
  transactionIds: string[],
): Promise<SettleResult> {
  const settled: string[] = [];
  const skipped: string[] = [];
  const validIds = transactionIds.filter((id) => ObjectId.isValid(id));
  if (validIds.length === 0) return { settled, skipped: transactionIds };

  const txs = (await db
    .collection(Collections.transactions)
    .find({
      _id: { $in: validIds.map((id) => new ObjectId(id)) },
      type: "campaign_completion",
    })
    .toArray()) as TransactionDoc[];

  const found = new Set(txs.map((t) => t._id!.toString()));
  for (const id of transactionIds) {
    if (!found.has(id)) skipped.push(id);
  }

  const now = new Date();
  const driversToRecompute = new Set<string>();

  for (const t of txs) {
    const id = t._id!.toString();
    if (t.tier === "available") {
      skipped.push(id);
      continue;
    }
    await db.collection(Collections.transactions).updateOne(
      { _id: t._id },
      { $set: { tier: "available", availableAt: now } },
    );
    settled.push(id);
    driversToRecompute.add(t.driverId);
  }

  await Promise.all(
    Array.from(driversToRecompute).map((d) => recomputeWallet(d)),
  );

  return { settled, skipped };
}
