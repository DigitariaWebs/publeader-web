import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  BUDGET_TIERS,
  type BudgetTier,
  type CampaignDoc,
  type CampaignType,
  type CompanyDoc,
  type DriverDoc,
} from "./schemas";

export type CampaignServiceErrorCode =
  | "invalid_title"
  | "invalid_description"
  | "invalid_city"
  | "invalid_dates"
  | "invalid_type"
  | "invalid_tier"
  | "invalid_budget"
  | "invalid_capacity"
  | "invalid_reward"
  | "invalid_zones"
  | "invalid_assets"
  | "invalid_brand"
  | "invalid_borne"
  | "not_found"
  | "frozen_field"
  | "already_published"
  | "draft_only"
  | "forbidden"
  | "wrong_type"
  | "driver_not_validated"
  | "city_mismatch"
  | "already_assigned"
  | "campaign_full"
  | "not_published"
  | "driver_busy"
  | "invalid_terminal"
  | "unknown";

export class CampaignServiceError extends Error {
  code: CampaignServiceErrorCode;
  meta?: Record<string, unknown>;
  constructor(
    code: CampaignServiceErrorCode,
    message?: string,
    meta?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.code = code;
    this.meta = meta;
  }
}

// --- Validation helpers ---------------------------------------------------

const CAMPAIGN_TYPES: CampaignType[] = ["flocage", "borne"];

function trimOrThrow(
  value: unknown,
  code: CampaignServiceErrorCode,
  opts: { min?: number; max?: number } = {},
): string {
  if (typeof value !== "string") throw new CampaignServiceError(code);
  const trimmed = value.trim();
  const min = opts.min ?? 1;
  const max = opts.max ?? 200;
  if (trimmed.length < min || trimmed.length > max) {
    throw new CampaignServiceError(code);
  }
  return trimmed;
}

function parseDate(
  value: unknown,
  code: CampaignServiceErrorCode = "invalid_dates",
): Date {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new CampaignServiceError(code);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new CampaignServiceError(code);
  return d;
}

function differenceInDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function validateZones(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new CampaignServiceError("invalid_zones");
  const out: string[] = [];
  for (const z of value) {
    if (typeof z !== "string") throw new CampaignServiceError("invalid_zones");
    const t = z.trim();
    if (t) out.push(t);
  }
  if (out.length > 30) throw new CampaignServiceError("invalid_zones");
  return out;
}

function validateAssetIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new CampaignServiceError("invalid_assets");
  const out: string[] = [];
  for (const a of value) {
    if (typeof a !== "string" || !ObjectId.isValid(a)) {
      throw new CampaignServiceError("invalid_assets");
    }
    out.push(a);
  }
  return out;
}

function validateInt(
  value: unknown,
  code: CampaignServiceErrorCode,
  min: number,
  max: number,
): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
    throw new CampaignServiceError(code);
  }
  if (n < min || n > max) throw new CampaignServiceError(code);
  return n;
}

// --- DTOs ------------------------------------------------------------------

export type CampaignCreateInput = {
  campaignType: string;
  title: string;
  description: string;
  brand?: string;
  domain?: string;
  city: string;
  zones?: string[];
  startDate: string | Date;
  endDate: string | Date;
  budgetTier: string;
  budgetCents: number;
  rewardCents?: number;
  driversNeeded?: number;
  borne?: {
    count: number;
    targetImpressions: number;
  };
  assetIds?: string[];
  heroImageUrl?: string;
};

export type CampaignUpdateInput = Partial<CampaignCreateInput>;

// --- Service ---------------------------------------------------------------

async function loadCompany(companyId: string): Promise<CompanyDoc> {
  const doc = (await db
    .collection(Collections.companies)
    .findOne({ _id: new ObjectId(companyId) })) as CompanyDoc | null;
  if (!doc) throw new CampaignServiceError("not_found", "company not found");
  return doc;
}

async function loadCampaignDoc(
  companyId: string,
  campaignId: string,
): Promise<CampaignDoc> {
  if (!ObjectId.isValid(campaignId)) {
    throw new CampaignServiceError("not_found");
  }
  const doc = (await db
    .collection(Collections.campaigns)
    .findOne({ _id: new ObjectId(campaignId), companyId })) as CampaignDoc | null;
  if (!doc) throw new CampaignServiceError("not_found");
  return doc;
}

function buildCampaignFromInput(
  input: CampaignCreateInput,
  company: CompanyDoc,
): Omit<CampaignDoc, "_id" | "createdAt" | "updatedAt"> {
  if (typeof input.campaignType !== "string" || !CAMPAIGN_TYPES.includes(input.campaignType as CampaignType)) {
    throw new CampaignServiceError("invalid_type");
  }
  const campaignType = input.campaignType as CampaignType;

  if (typeof input.budgetTier !== "string" || !BUDGET_TIERS.includes(input.budgetTier as BudgetTier)) {
    throw new CampaignServiceError("invalid_tier");
  }
  const budgetTier = input.budgetTier as BudgetTier;

  const title = trimOrThrow(input.title, "invalid_title", { min: 3, max: 120 });
  const description = trimOrThrow(input.description, "invalid_description", {
    min: 1,
    max: 2000,
  });
  const city = trimOrThrow(input.city, "invalid_city", { min: 2, max: 80 });
  const brand = trimOrThrow(input.brand ?? company.companyName, "invalid_brand", {
    min: 1,
    max: 120,
  });
  const domain = trimOrThrow(input.domain ?? company.domain, "invalid_brand", {
    min: 1,
    max: 120,
  });

  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  if (endDate <= startDate) throw new CampaignServiceError("invalid_dates");
  const durationDays = differenceInDays(startDate, endDate);

  const budget = validateInt(input.budgetCents, "invalid_budget", 0, 100_000_000);

  const zones = validateZones(input.zones);
  const assetIds = validateAssetIds(input.assetIds);

  let driversNeeded = 0;
  let rewardCents = 0;
  let borne: CampaignDoc["borne"];

  if (campaignType === "flocage") {
    driversNeeded = validateInt(
      input.driversNeeded,
      "invalid_capacity",
      1,
      500,
    );
    rewardCents = validateInt(input.rewardCents, "invalid_reward", 0, 1_000_000);
  } else {
    if (!input.borne || typeof input.borne !== "object") {
      throw new CampaignServiceError("invalid_borne");
    }
    const count = validateInt(input.borne.count, "invalid_borne", 1, 1000);
    const targetImpressions = validateInt(
      input.borne.targetImpressions,
      "invalid_borne",
      0,
      100_000_000,
    );
    borne = { count, targetImpressions };
    rewardCents = 0;
    driversNeeded = 0;
  }

  return {
    companyId: company._id!.toString(),
    brand,
    domain,
    title,
    description,
    campaignType,
    budgetTier,
    budgetCents: budget,
    city,
    zones,
    startDate,
    endDate,
    durationDays,
    rewardCents,
    status: "draft",
    progress: 0,
    kmDone: 0,
    kmTotal: campaignType === "flocage" ? driversNeeded * 1000 : 0,
    driversNeeded,
    driversAssigned: 0,
    assignedDriverIds: [],
    trackingMode: campaignType === "flocage" ? "gps" : "manual",
    heroImageUrl:
      typeof input.heroImageUrl === "string" && input.heroImageUrl.trim()
        ? input.heroImageUrl.trim()
        : undefined,
    assetIds,
    borne,
  };
}

export async function createDraftCampaign(
  companyId: string,
  input: CampaignCreateInput,
): Promise<CampaignDoc> {
  const company = await loadCompany(companyId);
  const base = buildCampaignFromInput(input, company);
  const now = new Date();
  const doc: CampaignDoc = {
    ...base,
    createdAt: now,
    updatedAt: now,
  };
  const ins = await db.collection(Collections.campaigns).insertOne(doc);
  return { ...doc, _id: ins.insertedId };
}

export async function listMyCampaigns(
  companyId: string,
  status?: CampaignDoc["status"],
): Promise<CampaignDoc[]> {
  const filter: Record<string, unknown> = { companyId };
  if (status) filter.status = status;
  return (await db
    .collection(Collections.campaigns)
    .find(filter)
    .sort({ updatedAt: -1 })
    .toArray()) as CampaignDoc[];
}

export async function getMyCampaign(
  companyId: string,
  campaignId: string,
): Promise<CampaignDoc> {
  return loadCampaignDoc(companyId, campaignId);
}

const FROZEN_KEYS_AFTER_PUBLISH = new Set<keyof CampaignDoc>([
  "campaignType",
  "city",
  "startDate",
  "budgetTier",
  "budgetCents",
  "rewardCents",
  "driversNeeded",
  "borne",
]);

export async function updateCampaign(
  companyId: string,
  campaignId: string,
  patch: CampaignUpdateInput,
): Promise<CampaignDoc> {
  const existing = await loadCampaignDoc(companyId, campaignId);
  const isDraft = existing.status === "draft";

  // Build the field-level patch. Drafts can change anything; non-drafts can
  // change only a whitelisted set.
  const allowed: Partial<CampaignDoc> = {};
  if (patch.title !== undefined) {
    allowed.title = trimOrThrow(patch.title, "invalid_title", { min: 3, max: 120 });
  }
  if (patch.description !== undefined) {
    allowed.description = trimOrThrow(patch.description, "invalid_description", {
      min: 1,
      max: 2000,
    });
  }
  if (patch.zones !== undefined) {
    allowed.zones = validateZones(patch.zones);
  }
  if (patch.assetIds !== undefined) {
    allowed.assetIds = validateAssetIds(patch.assetIds);
  }
  if (patch.heroImageUrl !== undefined) {
    allowed.heroImageUrl =
      typeof patch.heroImageUrl === "string" && patch.heroImageUrl.trim()
        ? patch.heroImageUrl.trim()
        : undefined;
  }
  if (patch.brand !== undefined) {
    allowed.brand = trimOrThrow(patch.brand, "invalid_brand", { min: 1, max: 120 });
  }
  if (patch.domain !== undefined) {
    allowed.domain = trimOrThrow(patch.domain, "invalid_brand", { min: 1, max: 120 });
  }
  if (patch.endDate !== undefined) {
    const end = parseDate(patch.endDate);
    if (end <= existing.startDate) throw new CampaignServiceError("invalid_dates");
    allowed.endDate = end;
    allowed.durationDays = differenceInDays(existing.startDate, end);
  }

  // Frozen-after-publish fields.
  if (patch.campaignType !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "campaignType");
    if (!CAMPAIGN_TYPES.includes(patch.campaignType as CampaignType)) {
      throw new CampaignServiceError("invalid_type");
    }
    allowed.campaignType = patch.campaignType as CampaignType;
  }
  if (patch.city !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "city");
    allowed.city = trimOrThrow(patch.city, "invalid_city", { min: 2, max: 80 });
  }
  if (patch.startDate !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "startDate");
    const start = parseDate(patch.startDate);
    const end = allowed.endDate ?? existing.endDate;
    if (end <= start) throw new CampaignServiceError("invalid_dates");
    allowed.startDate = start;
    allowed.durationDays = differenceInDays(start, end);
  }
  if (patch.budgetTier !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "budgetTier");
    if (!BUDGET_TIERS.includes(patch.budgetTier as BudgetTier)) {
      throw new CampaignServiceError("invalid_tier");
    }
    allowed.budgetTier = patch.budgetTier as BudgetTier;
  }
  if (patch.budgetCents !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "budgetCents");
    allowed.budgetCents = validateInt(patch.budgetCents, "invalid_budget", 0, 100_000_000);
  }
  if (patch.rewardCents !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "rewardCents");
    allowed.rewardCents = validateInt(patch.rewardCents, "invalid_reward", 0, 1_000_000);
  }
  if (patch.driversNeeded !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "driversNeeded");
    allowed.driversNeeded = validateInt(
      patch.driversNeeded,
      "invalid_capacity",
      1,
      500,
    );
    allowed.kmTotal = allowed.driversNeeded * 1000;
  }
  if (patch.borne !== undefined) {
    if (!isDraft) throw new CampaignServiceError("frozen_field", "borne");
    if (!patch.borne || typeof patch.borne !== "object") {
      throw new CampaignServiceError("invalid_borne");
    }
    const count = validateInt(patch.borne.count, "invalid_borne", 1, 1000);
    const targetImpressions = validateInt(
      patch.borne.targetImpressions,
      "invalid_borne",
      0,
      100_000_000,
    );
    allowed.borne = { count, targetImpressions };
  }

  // No-op patch is a successful read.
  const keys = Object.keys(allowed);
  if (keys.length === 0) return existing;
  // Sanity: detect frozen keys silently slipping through.
  for (const k of keys) {
    if (FROZEN_KEYS_AFTER_PUBLISH.has(k as keyof CampaignDoc) && !isDraft) {
      throw new CampaignServiceError("frozen_field", k);
    }
  }

  allowed.updatedAt = new Date();
  await db
    .collection(Collections.campaigns)
    .updateOne(
      { _id: new ObjectId(campaignId), companyId },
      { $set: allowed },
    );
  return { ...existing, ...allowed };
}

export async function publishCampaign(
  companyId: string,
  campaignId: string,
  now: Date = new Date(),
): Promise<CampaignDoc> {
  const existing = await loadCampaignDoc(companyId, campaignId);
  if (existing.status !== "draft") {
    throw new CampaignServiceError("already_published");
  }
  // Final shape sanity: re-validate Borne/Flocage requirements.
  if (existing.campaignType === "flocage" && existing.driversNeeded < 1) {
    throw new CampaignServiceError("invalid_capacity");
  }
  if (existing.campaignType === "borne" && (!existing.borne || existing.borne.count < 1)) {
    throw new CampaignServiceError("invalid_borne");
  }
  const next: CampaignDoc["status"] =
    now >= existing.endDate
      ? "completed"
      : now >= existing.startDate
        ? "active"
        : "upcoming";
  const updatedAt = new Date();
  await db
    .collection(Collections.campaigns)
    .updateOne(
      { _id: new ObjectId(campaignId), companyId, status: "draft" },
      { $set: { status: next, updatedAt } },
    );
  await db.collection(Collections.campaignEvents).insertOne({
    campaignId,
    type: "status_change",
    at: updatedAt,
    meta: { from: "draft", to: next, source: "publish" },
  });
  return { ...existing, status: next, updatedAt };
}

export async function deleteDraftCampaign(
  companyId: string,
  campaignId: string,
): Promise<void> {
  const existing = await loadCampaignDoc(companyId, campaignId);
  if (existing.status !== "draft") {
    throw new CampaignServiceError("draft_only");
  }
  await db
    .collection(Collections.campaigns)
    .deleteOne({ _id: new ObjectId(campaignId), companyId, status: "draft" });
}

// --- Assignment (A5) -------------------------------------------------------

export type EligibleDriverDTO = {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  rating: number;
  campaignsDone: number;
  totalKm: number;
};

export type AssignedDriverDTO = EligibleDriverDTO & {
  phone: string;
  email?: string;
};

function ensurePublished(campaign: CampaignDoc): void {
  if (campaign.status !== "upcoming" && campaign.status !== "active") {
    throw new CampaignServiceError(
      "not_published",
      `campaign status: ${campaign.status}`,
    );
  }
}

function ensureFlocage(campaign: CampaignDoc): void {
  if (campaign.campaignType !== "flocage") {
    throw new CampaignServiceError("wrong_type", "flocage required");
  }
}

function ensureBorne(campaign: CampaignDoc): void {
  if (campaign.campaignType !== "borne") {
    throw new CampaignServiceError("wrong_type", "borne required");
  }
}

/**
 * Loads validated drivers in the campaign's city who are not already
 * assigned to another active/upcoming campaign. Returns the drivers
 * available for advertiser-driven assignment.
 */
export async function listEligibleDrivers(
  companyId: string,
  campaignId: string,
): Promise<EligibleDriverDTO[]> {
  const campaign = await loadCampaignDoc(companyId, campaignId);
  ensureFlocage(campaign);

  const drivers = (await db
    .collection(Collections.drivers)
    .find({ status: "validated", city: campaign.city })
    .toArray()) as DriverDoc[];

  if (drivers.length === 0) return [];

  // Exclude drivers already assigned to this campaign or another live one.
  const driverIds = drivers.map((d) => d._id!.toString());
  const liveCampaigns = (await db
    .collection(Collections.campaigns)
    .find({
      status: { $in: ["upcoming", "active"] },
      assignedDriverIds: { $in: driverIds },
    })
    .project({ assignedDriverIds: 1 })
    .toArray()) as { assignedDriverIds: string[] }[];

  const busy = new Set<string>();
  for (const c of liveCampaigns) {
    for (const id of c.assignedDriverIds) busy.add(id);
  }

  return drivers
    .filter((d) => {
      const id = d._id!.toString();
      return !busy.has(id);
    })
    .map((d) => ({
      id: d._id!.toString(),
      firstName: d.firstName,
      lastName: d.lastName,
      city: d.city,
      rating: d.rating,
      campaignsDone: d.campaignsDone,
      totalKm: d.totalKm,
    }));
}

/** Joins assignedDriverIds[] -> driver docs for the detail view. */
export async function listAssignedDrivers(
  companyId: string,
  campaignId: string,
): Promise<AssignedDriverDTO[]> {
  const campaign = await loadCampaignDoc(companyId, campaignId);
  if (campaign.assignedDriverIds.length === 0) return [];
  const oids = campaign.assignedDriverIds
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));
  if (oids.length === 0) return [];
  const drivers = (await db
    .collection(Collections.drivers)
    .find({ _id: { $in: oids } })
    .toArray()) as DriverDoc[];
  return drivers.map((d) => ({
    id: d._id!.toString(),
    firstName: d.firstName,
    lastName: d.lastName,
    city: d.city,
    rating: d.rating,
    campaignsDone: d.campaignsDone,
    totalKm: d.totalKm,
    phone: d.phone,
  }));
}

export async function assignDriver(
  companyId: string,
  campaignId: string,
  driverId: string,
): Promise<CampaignDoc> {
  if (!ObjectId.isValid(driverId)) {
    throw new CampaignServiceError("not_found", "driver");
  }
  const campaign = await loadCampaignDoc(companyId, campaignId);
  ensureFlocage(campaign);
  ensurePublished(campaign);

  const driver = (await db
    .collection(Collections.drivers)
    .findOne({ _id: new ObjectId(driverId) })) as DriverDoc | null;
  if (!driver) throw new CampaignServiceError("not_found", "driver");
  if (driver.status !== "validated") {
    throw new CampaignServiceError("driver_not_validated");
  }
  if (driver.city !== campaign.city) {
    throw new CampaignServiceError("city_mismatch");
  }

  // Block if driver is already busy on another live campaign.
  const busy = await db
    .collection(Collections.campaigns)
    .findOne({
      _id: { $ne: new ObjectId(campaignId) },
      status: { $in: ["upcoming", "active"] },
      assignedDriverIds: driverId,
    });
  if (busy) throw new CampaignServiceError("driver_busy");

  // Atomic claim — same gate the driver-side accept uses.
  const updated = (await db
    .collection<CampaignDoc>(Collections.campaigns)
    .findOneAndUpdate(
      {
        _id: new ObjectId(campaignId),
        companyId,
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
    )) as CampaignDoc | null;

  if (!updated) {
    const refetch = await loadCampaignDoc(companyId, campaignId);
    if (refetch.assignedDriverIds.includes(driverId)) {
      throw new CampaignServiceError("already_assigned");
    }
    if (refetch.driversAssigned >= refetch.driversNeeded) {
      throw new CampaignServiceError("campaign_full");
    }
    throw new CampaignServiceError("unknown");
  }

  await db.collection(Collections.campaignEvents).insertOne({
    campaignId,
    type: "accept",
    driverId,
    at: new Date(),
    meta: {
      source: "advertiser",
      capacityBefore: updated.driversAssigned - 1,
      capacityAfter: updated.driversAssigned,
      capacityTotal: updated.driversNeeded,
    },
  });
  return updated;
}

export async function unassignDriver(
  companyId: string,
  campaignId: string,
  driverId: string,
): Promise<CampaignDoc> {
  const campaign = await loadCampaignDoc(companyId, campaignId);
  ensureFlocage(campaign);
  if (!campaign.assignedDriverIds.includes(driverId)) {
    throw new CampaignServiceError("not_found", "driver not assigned");
  }
  const updated = (await db
    .collection<CampaignDoc>(Collections.campaigns)
    .findOneAndUpdate(
      {
        _id: new ObjectId(campaignId),
        companyId,
        assignedDriverIds: driverId,
      },
      {
        $inc: { driversAssigned: -1 },
        $pull: { assignedDriverIds: driverId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    )) as CampaignDoc | null;

  if (!updated) throw new CampaignServiceError("unknown");

  await db.collection(Collections.campaignEvents).insertOne({
    campaignId,
    type: "cancel",
    driverId,
    at: new Date(),
    meta: { source: "advertiser-unassign" },
  });
  return updated;
}

// --- Borne terminal assignment --------------------------------------------

export async function assignTerminal(
  companyId: string,
  campaignId: string,
  terminalId: string,
): Promise<CampaignDoc> {
  const trimmed = terminalId.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new CampaignServiceError("invalid_terminal");
  }
  const campaign = await loadCampaignDoc(companyId, campaignId);
  ensureBorne(campaign);
  // Borne assignment allowed in draft, upcoming, active (not completed).
  if (campaign.status === "completed") {
    throw new CampaignServiceError("not_published");
  }

  const current = campaign.borne?.terminalIds ?? [];
  if (current.includes(trimmed)) {
    throw new CampaignServiceError("already_assigned");
  }
  if (current.length >= (campaign.borne?.count ?? 0)) {
    throw new CampaignServiceError("campaign_full");
  }
  const updated = (await db
    .collection<CampaignDoc>(Collections.campaigns)
    .findOneAndUpdate(
      {
        _id: new ObjectId(campaignId),
        companyId,
        "borne.terminalIds": { $ne: trimmed },
      },
      {
        $push: { "borne.terminalIds": trimmed },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    )) as CampaignDoc | null;
  if (!updated) throw new CampaignServiceError("unknown");
  return updated;
}

export async function unassignTerminal(
  companyId: string,
  campaignId: string,
  terminalId: string,
): Promise<CampaignDoc> {
  const trimmed = terminalId.trim();
  const campaign = await loadCampaignDoc(companyId, campaignId);
  ensureBorne(campaign);
  if (!(campaign.borne?.terminalIds ?? []).includes(trimmed)) {
    throw new CampaignServiceError("not_found");
  }
  const updated = (await db
    .collection<CampaignDoc>(Collections.campaigns)
    .findOneAndUpdate(
      { _id: new ObjectId(campaignId), companyId },
      {
        $pull: { "borne.terminalIds": trimmed },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    )) as CampaignDoc | null;
  if (!updated) throw new CampaignServiceError("unknown");
  return updated;
}
