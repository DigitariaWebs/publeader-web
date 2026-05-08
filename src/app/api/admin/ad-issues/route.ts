import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { db } from "@/lib/db";
import {
  Collections,
  type AdIssueReportDoc,
  type AdIssueStatus,
  type CampaignDoc,
  type TerminalDoc,
} from "@/lib/schemas";
import { requireAdmin } from "@/lib/session";
import { serializeIssue } from "@/lib/ad-serializer";

const VALID_STATUSES: AdIssueStatus[] = ["open", "resolved", "dismissed"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as AdIssueStatus | null;
  const partnerId = url.searchParams.get("partnerId");

  const filter: Record<string, unknown> = {};
  if (status && VALID_STATUSES.includes(status)) filter.status = status;
  if (partnerId) filter.partnerId = partnerId;

  const issues = (await db
    .collection(Collections.adIssueReports)
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray()) as AdIssueReportDoc[];

  const campaignIds = Array.from(new Set(issues.map((i) => i.campaignId)));
  const terminalIds = Array.from(new Set(issues.map((i) => i.terminalId)));

  const [campaignDocs, terminalDocs] = await Promise.all([
    campaignIds.length
      ? (db
          .collection(Collections.campaigns)
          .find({ _id: { $in: campaignIds.map((id) => new ObjectId(id)) } })
          .toArray() as Promise<CampaignDoc[]>)
      : Promise.resolve([]),
    terminalIds.length
      ? (db
          .collection(Collections.terminals)
          .find({ _id: { $in: terminalIds.map((id) => new ObjectId(id)) } })
          .toArray() as Promise<TerminalDoc[]>)
      : Promise.resolve([]),
  ]);
  const campaignMap = new Map(
    campaignDocs.map((c) => [c._id!.toString(), c.title]),
  );
  const terminalMap = new Map(
    terminalDocs.map((t) => [t._id!.toString(), t.name]),
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
