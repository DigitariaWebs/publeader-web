import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  reject,
  ValidationServiceError,
} from "@/lib/validation-service";
import {
  VALIDATION_KINDS,
  type ValidationKind,
  type ValidationRejectReason,
} from "@/lib/schemas";

type Body = { reason?: string; note?: string };

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const { kind, id } = await ctx.params;
  if (!VALIDATION_KINDS.includes(kind as ValidationKind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;
  const reason = body.reason as ValidationRejectReason;
  if (!reason) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  try {
    await reject(
      kind as ValidationKind,
      id,
      reason,
      body.note,
      auth.user.id,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationServiceError) {
      const status = e.code === "not_found" ? 404 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
