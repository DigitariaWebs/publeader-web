import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type DriverDoc, type ValidationStatus } from "@/lib/schemas";
import { ObjectId } from "mongodb";

const VALID_STATUSES: ValidationStatus[] = ["pending", "validated", "rejected"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as ValidationStatus | null;
  const city = url.searchParams.get("city");
  const q = url.searchParams.get("q");

  const filter: Record<string, unknown> = {};
  if (status && VALID_STATUSES.includes(status)) filter.status = status;
  if (city) filter.city = city;
  if (q) {
    filter.$or = [
      { firstName: { $regex: q, $options: "i" } },
      { lastName: { $regex: q, $options: "i" } },
    ];
  }

  const docs = (await db
    .collection(Collections.drivers)
    .find(filter)
    .sort({ joinedAt: -1 })
    .toArray()) as DriverDoc[];

  const userIds = docs.map((d) => d.userId).filter(Boolean);
  const users =
    userIds.length > 0
      ? await db
          .collection("user")
          .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
          .project({ _id: 1, email: 1 })
          .toArray()
      : [];
  const emailMap = new Map(users.map((u) => [u._id.toString(), u.email as string]));

  return NextResponse.json({
    drivers: docs.map((d) => ({
      id: d._id!.toString(),
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone,
      city: d.city,
      status: d.status,
      rating: d.rating,
      campaignsDone: d.campaignsDone,
      totalKm: d.totalKm,
      totalEarningsCents: d.totalEarningsCents,
      documentsApproved: d.documentsApproved,
      joinedAt: d.joinedAt.toISOString(),
      email: emailMap.get(d.userId) ?? "",
    })),
  });
}
