import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc } from "@/lib/schemas";

type Body = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  password: string;
  domain: string;
  sector: string;
  city: string;
  website?: string;
  description?: string;
};

function validate(b: Partial<Body>): string | null {
  if (!b.companyName?.trim()) return "companyName required";
  if (!b.contactName?.trim()) return "contactName required";
  if (!b.email?.trim()) return "email required";
  if (!b.password || b.password.length < 6) return "password >= 6 chars";
  if (!b.phone?.trim()) return "phone required";
  if (!b.domain?.trim()) return "domain required";
  if (!b.sector?.trim()) return "sector required";
  if (!b.city?.trim()) return "city required";
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
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
      name: body.contactName!.trim(),
    },
    asResponse: false,
  });

  const userId = result.user.id;

  await db.collection("user").updateOne(
    { _id: userId } as never,
    {
      $set: {
        role: "advertiser",
        status: "pending",
        phone: body.phone!.trim(),
      },
    },
  );

  const companyDoc: CompanyDoc = {
    userId,
    companyName: body.companyName!.trim(),
    contactName: body.contactName!.trim(),
    phone: body.phone!.trim(),
    domain: body.domain!.trim(),
    sector: body.sector!.trim(),
    city: body.city!.trim(),
    website: body.website?.trim(),
    description: body.description?.trim(),
    status: "pending",
    budgetTotal: 0,
    campaignsCount: 0,
    createdAt: new Date(),
  };
  const ins = await db.collection(Collections.companies).insertOne(companyDoc);
  const companyId = ins.insertedId.toString();

  let organizationId: string | undefined;
  try {
    const orgSlug = `${slugify(body.companyName!)}-${companyId.slice(-6)}`;
    const org = await auth.api.createOrganization({
      headers: req.headers,
      body: {
        name: body.companyName!.trim(),
        slug: orgSlug,
        userId,
      },
    });
    organizationId = org?.id;
    if (organizationId) {
      await db
        .collection(Collections.companies)
        .updateOne({ _id: ins.insertedId }, { $set: { organizationId } });
    }
  } catch (e) {
    console.warn("[register/company] organization create failed", e);
  }

  await db
    .collection("user")
    .updateOne({ _id: userId } as never, { $set: { companyId } });

  return NextResponse.json({
    ok: true,
    userId,
    companyId,
    organizationId,
    needsEmailVerification: true,
  });
}
