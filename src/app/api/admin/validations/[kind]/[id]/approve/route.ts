import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  approve,
  ValidationServiceError,
} from "@/lib/validation-service";
import { VALIDATION_KINDS, type ValidationKind } from "@/lib/schemas";

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
  try {
    await approve(kind as ValidationKind, id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationServiceError) {
      const status =
        e.code === "not_found"
          ? 404
          : e.code === "documents_not_approved"
            ? 409
            : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
