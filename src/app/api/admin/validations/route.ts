import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getQueue } from "@/lib/validation-service";
import {
  VALIDATION_KINDS,
  type ValidationKind,
  type ValidationStatus,
} from "@/lib/schemas";

const VALID_STATUSES: ValidationStatus[] = ["pending", "validated", "rejected"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  const kindParam = url.searchParams.get("kind");
  const status = (
    VALID_STATUSES.includes(statusParam as ValidationStatus)
      ? statusParam
      : "pending"
  ) as ValidationStatus;
  const kind =
    kindParam && VALIDATION_KINDS.includes(kindParam as ValidationKind)
      ? (kindParam as ValidationKind)
      : undefined;

  const items = await getQueue({ status, kind });

  // Counts per kind for header chips (always pending).
  const allPending = await getQueue({ status: "pending" });
  const counts = {
    pending: allPending.length,
    drivers: allPending.filter((i) => i.kind === "driver").length,
    companies: allPending.filter((i) => i.kind === "company").length,
    partners: allPending.filter((i) => i.kind === "partner").length,
  };

  return NextResponse.json({ items, counts });
}
