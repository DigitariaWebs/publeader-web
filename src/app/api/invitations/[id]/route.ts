import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CompanyDoc } from "@/lib/schemas";
import { Collections } from "@/lib/schemas";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  try {
    const inv = (await auth.api.getInvitation({
      headers: req.headers,
      query: { id } as never,
    })) as
      | {
          id: string;
          email: string;
          role: string;
          status: string;
          expiresAt: Date | string;
          organizationId: string;
          organizationName?: string;
          inviterEmail?: string;
        }
      | null;
    if (!inv) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    let organizationName = inv.organizationName;
    if (!organizationName) {
      const company = (await db
        .collection(Collections.companies)
        .findOne({ organizationId: inv.organizationId })) as CompanyDoc | null;
      organizationName = company?.companyName;
    }
    return NextResponse.json({
      invitation: {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: new Date(inv.expiresAt).toISOString(),
        organizationId: inv.organizationId,
        organizationName,
        inviterEmail: inv.inviterEmail,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "not_found", message: (e as Error).message },
      { status: 404 },
    );
  }
}
