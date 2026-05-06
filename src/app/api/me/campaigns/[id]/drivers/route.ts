import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  CampaignServiceError,
  assignDriver,
  listAssignedDrivers,
} from "@/lib/campaign-service";
import { loadBrandMap, serializeCampaign } from "@/lib/campaign-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  wrong_type: 409,
  not_published: 409,
  driver_not_validated: 409,
  city_mismatch: 409,
  driver_busy: 409,
  already_assigned: 409,
  campaign_full: 409,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id } = await ctx.params;
  try {
    const drivers = await listAssignedDrivers(
      auth.company._id.toString(),
      id,
    );
    return NextResponse.json({ drivers });
  } catch (e) {
    if (e instanceof CampaignServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[GET drivers]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id } = await ctx.params;
  let body: { driverId?: string };
  try {
    body = (await req.json()) as { driverId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.driverId) {
    return NextResponse.json({ error: "missing_driverId" }, { status: 400 });
  }
  try {
    const doc = await assignDriver(
      auth.company._id.toString(),
      id,
      body.driverId,
    );
    const brandMap = await loadBrandMap([doc]);
    return NextResponse.json({
      campaign: serializeCampaign(doc, brandMap.get(doc.companyId)),
    });
  } catch (e) {
    if (e instanceof CampaignServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[POST assign driver]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
