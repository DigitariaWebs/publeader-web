import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  AD_ISSUE_KINDS,
  Collections,
  type AdIssueKind,
  type AdIssueReportDoc,
  type AdIssueStatus,
  type AdScheduleDoc,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requirePartner } from "@/lib/session";
import { serializeIssue } from "@/lib/ad-serializer";

const VALID_STATUSES: AdIssueStatus[] = ["open", "resolved", "dismissed"];

export async function GET(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }
  const partnerId = auth.partner._id.toString();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as AdIssueStatus | null;
  const filter: Record<string, unknown> = { partnerId };
  if (status && VALID_STATUSES.includes(status)) filter.status = status;

  const issues = (await db
    .collection(Collections.adIssueReports)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()) as AdIssueReportDoc[];

  if (!issues.length) {
    return NextResponse.json({ issues: [] });
  }

  const campaignIds = Array.from(new Set(issues.map((i) => i.campaignId)));
  const terminalIds = Array.from(new Set(issues.map((i) => i.terminalId)));
  const [campaigns, terminals] = await Promise.all([
    db
      .collection(Collections.campaigns)
      .find({ _id: { $in: campaignIds.map((id) => new ObjectId(id)) } })
      .toArray() as Promise<CampaignDoc[]>,
    db
      .collection(Collections.terminals)
      .find({ _id: { $in: terminalIds.map((id) => new ObjectId(id)) } })
      .toArray() as Promise<TerminalDoc[]>,
  ]);
  const campaignMap = new Map(
    campaigns.map((c) => [c._id!.toString(), c.title]),
  );
  const terminalMap = new Map(
    terminals.map((t) => [t._id!.toString(), t.name]),
  );

  return NextResponse.json({
    issues: issues.map((i) =>
      serializeIssue(i, {
        campaignTitle: campaignMap.get(i.campaignId),
        terminalName: terminalMap.get(i.terminalId),
      }),
    ),
  });
}

type CreateBody = {
  scheduleId?: string;
  kind?: AdIssueKind;
  description?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requirePartner(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.partner._id) {
    return NextResponse.json({ error: "partner_missing" }, { status: 409 });
  }
  const partnerId = auth.partner._id.toString();

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.scheduleId || !body.kind || !body.description?.trim()) {
    return NextResponse.json(
      { error: "scheduleId, kind, description required" },
      { status: 400 },
    );
  }
  if (!AD_ISSUE_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  if (body.description.length > 1000) {
    return NextResponse.json({ error: "description_too_long" }, { status: 400 });
  }

  let scheduleOid: ObjectId;
  try {
    scheduleOid = new ObjectId(body.scheduleId);
  } catch {
    return NextResponse.json({ error: "invalid_schedule" }, { status: 400 });
  }
  const schedule = (await db
    .collection(Collections.adSchedules)
    .findOne({ _id: scheduleOid })) as AdScheduleDoc | null;
  if (!schedule) {
    return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
  }
  if (schedule.partnerId !== partnerId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const doc: AdIssueReportDoc = {
    partnerId,
    terminalId: schedule.terminalId,
    scheduleId: body.scheduleId,
    campaignId: schedule.campaignId,
    kind: body.kind,
    description: body.description.trim(),
    status: "open",
    createdAt: new Date(),
    createdBy: auth.user.id,
  };
  const ins = await db.collection(Collections.adIssueReports).insertOne(doc);
  doc._id = ins.insertedId;
  return NextResponse.json({ issue: serializeIssue(doc) });
}
