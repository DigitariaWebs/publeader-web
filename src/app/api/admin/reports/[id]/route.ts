import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  ReportError,
  deleteReport,
  getReport,
} from "@/lib/reports/service";
import { serializeReport } from "@/lib/report-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const report = await getReport(id);
    return NextResponse.json({ report: serializeReport(report) });
  } catch (e) {
    if (e instanceof ReportError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    await deleteReport(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ReportError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
