import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import {
  AdScheduleServiceError,
  resolveSchedule,
  updateSchedule,
} from "@/lib/ad-schedule-service";
import { serializeSchedule } from "@/lib/ad-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_input: 400,
  schedule_finalized: 409,
};

type RouteCtx = { params: Promise<{ id: string }> };

type PatchBody = {
  startHour?: number;
  endHour?: number;
  intervalSeconds?: number;
  action?: "pause" | "resume";
  pauseReason?: string;
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const updated = await updateSchedule(id, {
      startHour: body.startHour,
      endHour: body.endHour,
      intervalSeconds: body.intervalSeconds,
      pause:
        body.action === "pause"
          ? { reason: body.pauseReason }
          : undefined,
      resume: body.action === "resume",
      pausedBy: auth.user.id,
    });
    const campaign = (await db
      .collection(Collections.campaigns)
      .findOne({ _id: new ObjectId(updated.campaignId) })) as CampaignDoc | null;
    const terminal = (await db
      .collection(Collections.terminals)
      .findOne({ _id: new ObjectId(updated.terminalId) })) as TerminalDoc | null;
    return NextResponse.json({
      schedule: serializeSchedule(resolveSchedule(updated, campaign), {
        campaignTitle: campaign?.title,
        campaignBrand: campaign?.brand,
        campaignType: campaign?.campaignType,
        campaignStartDate: campaign?.startDate,
        campaignEndDate: campaign?.endDate,
        terminalName: terminal?.name,
        terminalCode: terminal?.code,
      }),
    });
  } catch (e) {
    if (e instanceof AdScheduleServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
