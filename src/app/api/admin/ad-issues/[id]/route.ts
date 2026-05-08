import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type AdIssueReportDoc,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import { serializeIssue } from "@/lib/ad-serializer";

type RouteCtx = { params: Promise<{ id: string }> };

type PatchBody = {
  action?: "resolve" | "dismiss";
  resolution?: string;
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
  if (body.action !== "resolve" && body.action !== "dismiss") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  let oid: ObjectId;
  try {
    oid = new ObjectId(id);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const issue = (await db
    .collection(Collections.adIssueReports)
    .findOne({ _id: oid })) as AdIssueReportDoc | null;
  if (!issue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (issue.status !== "open") {
    return NextResponse.json({ error: "issue_finalized" }, { status: 409 });
  }

  const now = new Date();
  await db.collection(Collections.adIssueReports).updateOne(
    { _id: oid },
    {
      $set: {
        status: body.action === "resolve" ? "resolved" : "dismissed",
        resolvedAt: now,
        resolvedBy: auth.user.id,
        resolution: body.resolution?.trim(),
      },
    },
  );
  const fresh = (await db
    .collection(Collections.adIssueReports)
    .findOne({ _id: oid })) as AdIssueReportDoc;

  // Joined fields for response.
  const [campaign, terminal] = await Promise.all([
    db
      .collection(Collections.campaigns)
      .findOne({ _id: new ObjectId(fresh.campaignId) }) as Promise<CampaignDoc | null>,
    db
      .collection(Collections.terminals)
      .findOne({ _id: new ObjectId(fresh.terminalId) }) as Promise<TerminalDoc | null>,
  ]);

  return NextResponse.json({
    issue: serializeIssue(fresh, {
      campaignTitle: campaign?.title,
      terminalName: terminal?.name,
    }),
  });
}
