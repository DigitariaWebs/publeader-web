import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { Collections, type CompanyDoc } from "@/lib/schemas";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const q: Record<string, unknown> = {};
  if (status) q.status = status;
  const docs = (await db
    .collection(Collections.companies)
    .find(q)
    .project({ companyName: 1, status: 1, sector: 1, city: 1, brandColor: 1 })
    .sort({ companyName: 1 })
    .toArray()) as Pick<
    CompanyDoc,
    "_id" | "companyName" | "status" | "sector" | "city" | "brandColor"
  >[];
  return NextResponse.json({
    companies: docs.map((c) => ({
      id: c._id!.toString(),
      name: c.companyName,
      status: c.status,
      sector: c.sector,
      city: c.city,
      brandColor: c.brandColor,
    })),
  });
}
