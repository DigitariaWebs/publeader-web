import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  TerminalServiceError,
  cancelMaintenance,
} from "@/lib/terminal-service";
import { serializeMaintenanceWindow } from "@/lib/terminal-serializer";

type RouteCtx = { params: Promise<{ id: string; windowId: string }> };

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_window: 409,
};

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { windowId } = await ctx.params;

  try {
    const win = await cancelMaintenance(windowId);
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
    console.error("[DELETE cancel maintenance]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
