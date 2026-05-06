import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  CampaignServiceError,
  unassignTerminal,
} from "@/lib/campaign-service";
import { loadBrandMap, serializeCampaign } from "@/lib/campaign-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  wrong_type: 409,
};

type RouteCtx = { params: Promise<{ id: string; terminalId: string }> };

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id, terminalId } = await ctx.params;
  try {
    const doc = await unassignTerminal(
      auth.company._id.toString(),
      id,
      decodeURIComponent(terminalId),
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
    console.error("[DELETE unassign terminal]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
