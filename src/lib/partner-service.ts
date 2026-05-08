import { ObjectId } from "mongodb";
import { db } from "./db";
import { Collections, type PartnerDoc } from "./schemas";

export type PartnerProfileUpdates = {
  businessName?: string;
  managerName?: string;
  phone?: string;
  address?: string;
  city?: string;
  openingHours?: string;
};

export class PartnerUpdateError extends Error {
  constructor(
    public readonly code:
      | "invalid_business_name"
      | "invalid_manager_name"
      | "invalid_phone"
      | "invalid_address"
      | "invalid_city"
      | "invalid_opening_hours"
      | "invalid_field",
    message: string,
  ) {
    super(message);
    this.name = "PartnerUpdateError";
  }
}

const ALLOWED_FIELDS = new Set([
  "businessName",
  "managerName",
  "phone",
  "address",
  "city",
  "openingHours",
]);

export async function updatePartnerProfile(
  partnerId: string,
  updates: PartnerProfileUpdates,
): Promise<PartnerDoc> {
  const partner = (await db
    .collection(Collections.partners)
    .findOne({ _id: new ObjectId(partnerId) })) as PartnerDoc | null;
  if (!partner) throw new Error("partner not found");

  for (const k of Object.keys(updates)) {
    if (!ALLOWED_FIELDS.has(k)) {
      throw new PartnerUpdateError("invalid_field", `field not allowed: ${k}`);
    }
  }

  const $set: Record<string, unknown> = {};

  if (updates.businessName !== undefined) {
    const v = updates.businessName.trim();
    if (v.length < 2 || v.length > 100) {
      throw new PartnerUpdateError(
        "invalid_business_name",
        "businessName must be 2–100 characters",
      );
    }
    $set.businessName = v;
  }
  if (updates.managerName !== undefined) {
    const v = updates.managerName.trim();
    if (v.length < 2 || v.length > 100) {
      throw new PartnerUpdateError(
        "invalid_manager_name",
        "managerName must be 2–100 characters",
      );
    }
    $set.managerName = v;
  }
  if (updates.phone !== undefined) {
    const v = updates.phone.trim();
    if (v.length < 5 || v.length > 30) {
      throw new PartnerUpdateError(
        "invalid_phone",
        "phone must be 5–30 characters",
      );
    }
    $set.phone = v;
  }
  if (updates.address !== undefined) {
    const v = updates.address.trim();
    if (v.length < 5 || v.length > 200) {
      throw new PartnerUpdateError(
        "invalid_address",
        "address must be 5–200 characters",
      );
    }
    $set.address = v;
  }
  if (updates.city !== undefined) {
    const v = updates.city.trim();
    if (v.length < 2 || v.length > 50) {
      throw new PartnerUpdateError(
        "invalid_city",
        "city must be 2–50 characters",
      );
    }
    $set.city = v;
  }
  if (updates.openingHours !== undefined) {
    const v = updates.openingHours.trim();
    if (v.length > 200) {
      throw new PartnerUpdateError(
        "invalid_opening_hours",
        "openingHours must be ≤ 200 characters",
      );
    }
    $set.openingHours = v;
  }

  if (Object.keys($set).length === 0) {
    return partner;
  }

  await db
    .collection(Collections.partners)
    .updateOne({ _id: partner._id }, { $set });

  const fresh = (await db
    .collection(Collections.partners)
    .findOne({ _id: partner._id })) as PartnerDoc;
  return fresh;
}
