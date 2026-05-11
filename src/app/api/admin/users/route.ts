import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeAdminUser, type AdminUserDTO } from "@/lib/user-serializer";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Roles served by additional-fields. listUsers's `searchField` only accepts
// email|name; we filter by role/banned/status client-side after the fetch
// so the route stays lean. For very large user tables we'd push these into
// a direct mongo query instead.

export async function GET(req: NextRequest) {
  const a = await requireAdmin(req.headers);
  if (!a.ok) return a.response;
  const url = new URL(req.url);
  const role = url.searchParams.get("role")?.trim() || undefined;
  const status = url.searchParams.get("status")?.trim() || undefined;
  const bannedParam = url.searchParams.get("banned");
  const banned =
    bannedParam === "true" ? true : bannedParam === "false" ? false : undefined;
  const search = url.searchParams.get("search")?.trim() || undefined;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  // Better-auth's listUsers searches one field at a time. To stay simple we
  // call it without `searchValue` and apply substring filtering in memory
  // when the admin types a search box value (works for ≤ MAX_LIMIT users).
  const result = await auth.api.listUsers({
    headers: req.headers,
    query: {
      limit,
      offset,
      sortBy: "createdAt",
      sortDirection: "desc",
      ...(search
        ? {
            searchValue: search,
            searchField: "email" as const,
            searchOperator: "contains" as const,
          }
        : {}),
    },
  });

  // result shape: { users: UserWithRole[], total: number, limit: number, offset: number }
  const raw = (result as { users?: unknown[] }).users ?? [];
  let users: AdminUserDTO[] = (raw as Parameters<typeof serializeAdminUser>[0][]).map(
    serializeAdminUser,
  );

  if (role) users = users.filter((u) => u.role === role);
  if (status) users = users.filter((u) => u.status === status);
  if (banned !== undefined) users = users.filter((u) => u.banned === banned);

  // Best-effort enrichment: attach driverId/companyId/partnerId from our user
  // collection in case better-auth's listUsers didn't include them (some
  // versions strip non-default additionalFields). Direct mongo lookup is
  // cheap given the bounded `limit`.
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const extra = (await db
      .collection("user")
      .find({ id: { $in: ids } })
      .project({
        id: 1,
        driverId: 1,
        companyId: 1,
        partnerId: 1,
        status: 1,
        phone: 1,
      })
      .toArray()) as Array<{
      id: string;
      driverId?: string;
      companyId?: string;
      partnerId?: string;
      status?: string;
      phone?: string;
    }>;
    const map = new Map(extra.map((e) => [e.id, e]));
    users = users.map((u) => {
      const e = map.get(u.id);
      if (!e) return u;
      return {
        ...u,
        driverId: u.driverId ?? e.driverId ?? null,
        companyId: u.companyId ?? e.companyId ?? null,
        partnerId: u.partnerId ?? e.partnerId ?? null,
        status: u.status ?? e.status ?? null,
        phone: u.phone ?? e.phone ?? null,
      };
    });
  }

  return NextResponse.json({
    users,
    total:
      (result as { total?: number }).total ?? users.length,
    limit,
    offset,
  });
}
