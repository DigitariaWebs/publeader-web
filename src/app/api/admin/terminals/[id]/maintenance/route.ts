import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Collections, type MaintenanceWindowDoc } from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import {
  TerminalServiceError,
  scheduleMaintenance,
} from "@/lib/terminal-service";
import { serializeMaintenanceWindow } from "@/lib/terminal-serializer";

type RouteCtx = { params: Promise<{ id: string }> };

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_window: 400,
};

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const docs = (await db
    .collection(Collections.maintenanceWindows)
    .find({ terminalId: id })
    .sort({ startsAt: -1 })
    .toArray()) as MaintenanceWindowDoc[];

  return NextResponse.json({
    maintenanceWindows: docs.map(serializeMaintenanceWindow),
  });
}

type CreateBody = {
  startsAt?: string;
  endsAt?: string;
  reason?: string;
};

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.startsAt || !body.endsAt || !body.reason?.trim()) {
    return NextResponse.json(
      { error: "startsAt, endsAt, reason required" },
      { status: 400 },
    );
  }

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);

  try {
    const win = await scheduleMaintenance(
      id,
      startsAt,
      endsAt,
      body.reason,
      auth.user.id,
    );
    return NextResponse.json({
      maintenanceWindow: serializeMaintenanceWindow(win),
    });
  } catch (e) {
    if (e instanceof TerminalServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[POST schedule maintenance]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
