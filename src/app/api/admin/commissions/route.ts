import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  listCommissions,
  type CommissionStatus,
} from "@/lib/commission-service";

const VALID_STATUSES: CommissionStatus[] = ["pending", "available"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const driverId = url.searchParams.get("driverId") ?? undefined;
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const status =
    statusParam && VALID_STATUSES.includes(statusParam as CommissionStatus)
      ? (statusParam as CommissionStatus)
      : undefined;

  const rows = await listCommissions({
    status,
    driverId,
    campaignId,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  return NextResponse.json({ commissions: rows });
}
