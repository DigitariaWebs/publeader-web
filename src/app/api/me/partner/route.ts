import { NextRequest, NextResponse } from "next/server";
import { requirePartner } from "@/lib/session";
import {
  PartnerUpdateError,
  updatePartnerProfile,
  type PartnerProfileUpdates,
} from "@/lib/partner-service";
import type { PartnerDoc } from "@/lib/schemas";

function serializePartner(p: PartnerDoc) {
  return {
    id: p._id!.toString(),
    businessName: p.businessName,
    managerName: p.managerName,
    phone: p.phone,
    address: p.address,
    city: p.city,
    openingHours: p.openingHours ?? "",
    monthlySprayRevenue: p.monthlySprayRevenue,
    monthlyAdsRevenue: p.monthlyAdsRevenue,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    partner: serializePartner(auth.partner),
    email: auth.user.email,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as PartnerProfileUpdates;

  try {
    const updated = await updatePartnerProfile(
      auth.partner._id!.toString(),
      body,
    );
    return NextResponse.json({
      partner: serializePartner(updated),
      email: auth.user.email,
    });
  } catch (e) {
    if (e instanceof PartnerUpdateError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
