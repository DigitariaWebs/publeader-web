import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  cancelInvitation,
  resendInvitation,
  TeamServiceError,
} from "@/lib/team-service";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  already_member: 409,
  already_invited: 409,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id } = await ctx.params;
  try {
    await cancelInvitation({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      requesterUserId: auth.user.id,
      invitationId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[DELETE invitation]", e);
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
  try {
    const inv = await resendInvitation({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      requesterUserId: auth.user.id,
      invitationId: id,
    });
    return NextResponse.json({ invitation: inv });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[POST resend]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
