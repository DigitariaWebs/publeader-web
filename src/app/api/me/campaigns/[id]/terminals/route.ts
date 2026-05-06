import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  CampaignServiceError,
  assignTerminal,
} from "@/lib/campaign-service";
import { loadBrandMap, serializeCampaign } from "@/lib/campaign-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  wrong_type: 409,
  not_published: 409,
  invalid_terminal: 400,
  already_assigned: 409,
  campaign_full: 409,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id } = await ctx.params;
  let body: { terminalId?: string };
  try {
    body = (await req.json()) as { terminalId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.terminalId) {
    return NextResponse.json({ error: "missing_terminalId" }, { status: 400 });
  }
  try {
    const doc = await assignTerminal(
      auth.company._id.toString(),
      id,
      body.terminalId,
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
    console.error("[POST assign terminal]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
