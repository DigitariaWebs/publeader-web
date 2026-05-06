import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import {
  removeMember,
  updateMemberRole,
  TeamServiceError,
} from "@/lib/team-service";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  cannot_modify_self: 409,
  last_admin: 409,
  invalid_role: 400,
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
    await removeMember({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      requesterUserId: auth.user.id,
      memberId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[DELETE member]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  const { id } = await ctx.params;
  let body: { role?: string };
  try {
    body = (await req.json()) as { role?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    await updateMemberRole({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      requesterUserId: auth.user.id,
      memberId: id,
      role: String(body.role ?? ""),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[PATCH member role]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
