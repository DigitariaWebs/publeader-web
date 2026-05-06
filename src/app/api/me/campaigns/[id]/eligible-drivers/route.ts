import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  CampaignServiceError,
  listEligibleDrivers,
} from "@/lib/campaign-service";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  wrong_type: 409,
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
    const drivers = await listEligibleDrivers(
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
    console.error("[GET eligible-drivers]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
