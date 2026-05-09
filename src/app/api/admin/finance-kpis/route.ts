import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getFinanceKpis } from "@/lib/finance-kpi-service";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const kpis = await getFinanceKpis();
  return NextResponse.json({ kpis });
}
