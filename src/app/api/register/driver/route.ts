import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collections, type DriverDoc } from "@/lib/schemas";

type Body = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  vehicleModel: string;
  vehicleYear: string;
  licensePlate: string;
  vehicleType: string;
};

function validate(b: Partial<Body>): string | null {
  if (!b.firstName?.trim()) return "firstName required";
  if (!b.lastName?.trim()) return "lastName required";
  if (!b.email?.trim()) return "email required";
  if (!b.password || b.password.length < 6) return "password >= 6 chars";
  if (!b.phone?.trim()) return "phone required";
  if (!b.city?.trim()) return "city required";
  if (!b.vehicleModel?.trim()) return "vehicleModel required";
  if (!b.vehicleYear?.trim()) return "vehicleYear required";
  if (!b.licensePlate?.trim()) return "licensePlate required";
  if (!b.vehicleType?.trim()) return "vehicleType required";
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
      name: `${body.firstName} ${body.lastName}`.trim(),
    },
    asResponse: false,
  });

  const userId = result.user.id;

  await db
    .collection("user")
    .updateOne(
      { _id: userId } as never,
      {
        $set: {
          role: "driver",
          status: "pending",
          phone: body.phone!.trim(),
        },
      },
    );

  const driverDoc: DriverDoc = {
    userId,
    firstName: body.firstName!.trim(),
    lastName: body.lastName!.trim(),
    phone: body.phone!.trim(),
    city: body.city!.trim(),
    vehicleModel: body.vehicleModel!.trim(),
    vehicleYear: body.vehicleYear!.trim(),
    licensePlate: body.licensePlate!.trim().toUpperCase(),
    vehicleType: body.vehicleType!.trim(),
    status: "pending",
    joinedAt: new Date(),
    campaignsDone: 0,
    rating: 0,
    totalKm: 0,
    totalEarnings: 0,
    documentsUploaded: false,
  };
  const ins = await db.collection(Collections.drivers).insertOne(driverDoc);

  await db
    .collection("user")
    .updateOne(
      { _id: userId } as never,
      { $set: { driverId: ins.insertedId.toString() } },
    );

  return NextResponse.json({
    ok: true,
    userId,
    driverId: ins.insertedId.toString(),
    needsEmailVerification: true,
  });
}
