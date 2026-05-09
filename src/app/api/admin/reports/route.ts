import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { REPORT_TYPES, type ReportType } from "@/lib/schemas";
import {
  ReportError,
  generateReport,
  listReports,
} from "@/lib/reports/service";
import { serializeReport } from "@/lib/report-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  invalid_type: 400,
  invalid_period: 400,
  not_found: 404,
  build_failed: 500,
  cloudinary_not_configured: 503,
};

// PDFs and ZIPs can take meaningful time on large datasets; bump the route's
// max execution allowance accordingly. (Vercel honors `maxDuration`.)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const type =
    typeParam && (REPORT_TYPES as string[]).includes(typeParam)
      ? (typeParam as ReportType)
      : undefined;
  const reports = await listReports({ type });
  return NextResponse.json({
    reports: reports.map(serializeReport),
  });
}

type PostBody = {
  type: ReportType;
  periodStart: string;
  periodEnd: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.type || !(REPORT_TYPES as string[]).includes(body.type)) {
    return NextResponse.json(
      { error: "invalid_type", message: "unknown report type" },
      { status: 400 },
    );
  }

  const start = new Date(body.periodStart);
  const end = new Date(body.periodEnd);

  try {
    const report = await generateReport({
      type: body.type,
      period: { start, end },
      adminId: auth.user.id,
    });
    return NextResponse.json({ report: serializeReport(report) }, { status: 201 });
  } catch (e) {
    if (e instanceof ReportError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[reports] generation failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
