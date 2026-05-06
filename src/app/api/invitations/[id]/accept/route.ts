import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { acceptInvitationAndLink, TeamServiceError } from "@/lib/team-service";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const s = await requireSession(req.headers);
  if (!s.ok) return s.response;
  const { id } = await ctx.params;
  try {
    const result = await acceptInvitationAndLink({
      headers: req.headers,
      invitationId: id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: e.code === "not_found" ? 404 : 400 },
      );
    }
    return NextResponse.json(
      { error: "unknown", message: (e as Error).message },
      { status: 400 },
    );
  }
}
