import { db } from "./db";
import { Collections, type CampaignDoc, type CampaignStatus } from "./schemas";
import { ObjectId } from "mongodb";
import { recomputeLifetimeStats } from "./driver-stats";

export function expectedStatus(
  campaign: Pick<CampaignDoc, "status" | "startDate" | "endDate">,
  now: Date = new Date(),
): CampaignStatus {
  // Manual gate: draft never auto-transitions until admin flips to upcoming.
  if (campaign.status === "draft") return "draft";
  if (now >= campaign.endDate) return "completed";
  if (now >= campaign.startDate) return "active";
  return "upcoming";
}

export function applyExpectedStatus<T extends CampaignDoc>(
  campaign: T,
  now: Date = new Date(),
): T {
  const next = expectedStatus(campaign, now);
  if (next === campaign.status) return campaign;
  return { ...campaign, status: next };
}

// Fire-and-forget DB sync. Caller should not await.
// When transitioning to 'completed', recomputes lifetime stats for every
// assigned driver — keeps DriverDoc snapshots in sync with reality.
export function syncStatusToDb(
  campaignId: ObjectId | string,
  fromStatus: CampaignStatus,
  toStatus: CampaignStatus,
  assignedDriverIds: string[] = [],
): void {
  if (fromStatus === toStatus) return;
  const _id =
    typeof campaignId === "string" ? new ObjectId(campaignId) : campaignId;
  Promise.all([
    db
      .collection(Collections.campaigns)
      .updateOne(
        { _id, status: fromStatus },
        { $set: { status: toStatus, updatedAt: new Date() } },
      ),
    db.collection(Collections.campaignEvents).insertOne({
      campaignId: _id.toString(),
      type: "status_change",
      at: new Date(),
      meta: { from: fromStatus, to: toStatus, source: "auto" },
    }),
  ])
    .then(async () => {
      if (toStatus === "completed" && assignedDriverIds.length > 0) {
        await Promise.all(
          assignedDriverIds.map((id) =>
            recomputeLifetimeStats(id).catch((e) =>
              console.warn(
                `[campaign-lifecycle] recompute lifetime failed for driver ${id}`,
                e,
              ),
            ),
          ),
        );
      }
    })
    .catch((err) => {
      console.warn("[campaign-lifecycle] sync failed", err);
    });
}

export function reconcileMany<T extends CampaignDoc>(
  campaigns: T[],
  now: Date = new Date(),
): T[] {
  return campaigns.map((c) => {
    const next = expectedStatus(c, now);
    if (next !== c.status && c._id) {
      syncStatusToDb(c._id, c.status, next, c.assignedDriverIds);
      return { ...c, status: next };
    }
    return c;
  });
}
