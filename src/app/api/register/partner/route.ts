import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collections, type PartnerDoc } from "@/lib/schemas";

type Body = {
  businessName: string;
  managerName: string;
  email: string;
  phone: string;
  password: string;
  address: string;
  city: string;
  openingHours?: string;
};

function validate(b: Partial<Body>): string | null {
  if (!b.businessName?.trim()) return "businessName required";
  if (!b.managerName?.trim()) return "managerName required";
  if (!b.email?.trim()) return "email required";
  if (!b.password || b.password.length < 6) return "password >= 6 chars";
  if (!b.phone?.trim()) return "phone required";
  if (!b.address?.trim()) return "address required";
  if (!b.city?.trim()) return "city required";
  return null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Body>;
  const err = validate(body);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: body.email!.trim().toLowerCase(),
      password: body.password!,
      name: body.managerName!.trim(),
    },
    asResponse: false,
  });

  const userId = result.user.id;

  await db.collection("user").updateOne(
    { _id: userId } as never,
    {
      $set: {
        role: "partner",
        status: "pending",
        phone: body.phone!.trim(),
      },
    },
  );

  const partnerDoc: PartnerDoc = {
    userId,
    businessName: body.businessName!.trim(),
    managerName: body.managerName!.trim(),
    phone: body.phone!.trim(),
    address: body.address!.trim(),
    city: body.city!.trim(),
    openingHours: body.openingHours?.trim(),
    monthlySprayRevenue: 0,
    monthlyAdsRevenue: 0,
    status: "pending",
    createdAt: new Date(),
  };
  const ins = await db
    .collection(Collections.partners)
    .insertOne(partnerDoc);
  const partnerId = ins.insertedId.toString();

  await db
    .collection("user")
    .updateOne({ _id: userId } as never, { $set: { partnerId } });

  return NextResponse.json({
    ok: true,
    userId,
    partnerId,
    needsEmailVerification: true,
  });
}
