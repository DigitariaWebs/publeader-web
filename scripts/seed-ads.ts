import { ObjectId } from "mongodb";
import { db, mongoClient } from "../src/lib/db";
import {
  AD_SCHEDULE_DEFAULT_END_HOUR,
  AD_SCHEDULE_DEFAULT_INTERVAL_SECONDS,
  AD_SCHEDULE_DEFAULT_START_HOUR,
  Collections,
  type AdImpressionDailyDoc,
  type AdIssueReportDoc,
  type AdScheduleDoc,
  type CampaignDoc,
  type TerminalDoc,
} from "../src/lib/schemas";
import { isoDate } from "../src/lib/ad-schedule-service";

const PARTNER_EMAIL = "partner@publeader.local";

async function findPartnerId(): Promise<string> {
  const user = await db.collection("user").findOne({ email: PARTNER_EMAIL });
  if (!user?.partnerId) {
    throw new Error(
      `partner user ${PARTNER_EMAIL} or its partnerId missing — run seed:users first`,
    );
  }
  return user.partnerId as string;
}

async function wipeAdsForPartner(partnerId: string) {
  const partnerTerminals = (await db
    .collection(Collections.terminals)
    .find({ partnerId })
    .toArray()) as TerminalDoc[];
  const terminalIds = partnerTerminals.map((t) => t._id!.toString());

  await db.collection(Collections.adSchedules).deleteMany({ partnerId });
  await db.collection(Collections.adIssueReports).deleteMany({ partnerId });
  if (terminalIds.length) {
    await db
      .collection(Collections.adImpressionsDaily)
      .deleteMany({ terminalId: { $in: terminalIds } });
  }
  console.log(
    `[seed:ads] wiped existing schedules + impressions + issues for partner ${partnerId}`,
  );
}

async function loadBorneCampaigns(): Promise<CampaignDoc[]> {
  return (await db
    .collection(Collections.campaigns)
    .find({ campaignType: "borne", status: { $ne: "draft" } })
    .toArray()) as CampaignDoc[];
}

async function ensureDemoBorneCampaigns(): Promise<CampaignDoc[]> {
  const existing = await loadBorneCampaigns();
  if (existing.length > 0) return existing;

  // Borrow first company in the DB (any advertiser) to host demo borne
  // campaigns. Required so /api/me/ad-schedules can join brand info.
  const company = await db.collection(Collections.companies).findOne({});
  if (!company) {
    throw new Error(
      "no companies found — run seed:companies first to provide borne campaign owner",
    );
  }
  const companyId = company._id.toString();

  const now = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 3600_000); // 7d ago
  const endDate = new Date(now.getTime() + 23 * 24 * 3600_000); // 23d future

  const docs: CampaignDoc[] = [
    {
      companyId,
      brand: "Nova Cosmétique",
      domain: "Beauté",
      title: "Nova Bornes Paris",
      description: "Diffusion sur écrans LED des bornes parisiennes.",
      campaignType: "borne",
      budgetTier: "growth",
      budgetCents: 500_000,
      city: "Paris",
      zones: ["Paris 6e", "Paris 9e", "Paris 19e"],
      startDate,
      endDate,
      durationDays: 30,
      rewardCents: 0,
      status: "active",
      progress: 30,
      kmDone: 0,
      kmTotal: 0,
      driversNeeded: 0,
      driversAssigned: 0,
      assignedDriverIds: [],
      trackingMode: "manual",
      borne: { count: 5, targetImpressions: 30_000, terminalIds: [] },
      createdAt: now,
      updatedAt: now,
    },
    {
      companyId,
      brand: "Le Clos des Vignes",
      domain: "Restauration",
      title: "Afterwork dégustation",
      description: "Image promo afterwork sur bornes nightlife.",
      campaignType: "borne",
      budgetTier: "boost",
      budgetCents: 150_000,
      city: "Paris",
      zones: ["Paris"],
      startDate,
      endDate,
      durationDays: 30,
      rewardCents: 0,
      status: "active",
      progress: 50,
      kmDone: 0,
      kmTotal: 0,
      driversNeeded: 0,
      driversAssigned: 0,
      assignedDriverIds: [],
      trackingMode: "manual",
      borne: { count: 3, targetImpressions: 10_000, terminalIds: [] },
      createdAt: now,
      updatedAt: now,
    },
  ];
  const ins = await db.collection(Collections.campaigns).insertMany(docs);
  for (let i = 0; i < docs.length; i++) {
    docs[i]._id = ins.insertedIds[i];
  }
  console.log(`[seed:ads] created ${docs.length} demo borne campaigns`);
  return docs;
}

async function ensureCampaignsAssigned(
  partnerTerminals: TerminalDoc[],
  campaigns: CampaignDoc[],
): Promise<{ schedule: AdScheduleDoc; campaign: CampaignDoc; terminal: TerminalDoc }[]> {
  const created: {
    schedule: AdScheduleDoc;
    campaign: CampaignDoc;
    terminal: TerminalDoc;
  }[] = [];
  if (!campaigns.length || !partnerTerminals.length) return created;

  // Assign each borne campaign to first 3 terminals (round-robin) and create
  // a schedule. Push terminal IDs into the campaign's borne.terminalIds for
  // realism.
  const now = new Date();
  let i = 0;
  for (const campaign of campaigns) {
    const targetTerminals = partnerTerminals.slice(0, 3);
    const terminalIdSet = new Set(campaign.borne?.terminalIds ?? []);
    for (const terminal of targetTerminals) {
      const terminalIdStr = terminal._id!.toString();
      terminalIdSet.add(terminalIdStr);

      const schedule: AdScheduleDoc = {
        terminalId: terminalIdStr,
        campaignId: campaign._id!.toString(),
        partnerId: terminal.partnerId,
        companyId: campaign.companyId,
        startHour: AD_SCHEDULE_DEFAULT_START_HOUR,
        endHour: AD_SCHEDULE_DEFAULT_END_HOUR,
        intervalSeconds: AD_SCHEDULE_DEFAULT_INTERVAL_SECONDS,
        status: campaign.status === "active" ? "scheduled" : "scheduled",
        createdAt: now,
        updatedAt: now,
      };
      const ins = await db
        .collection(Collections.adSchedules)
        .insertOne(schedule);
      schedule._id = ins.insertedId;
      created.push({ schedule, campaign, terminal });
      i++;
    }
    // Update campaign borne.terminalIds (so the assignment is visible).
    await db.collection(Collections.campaigns).updateOne(
      { _id: campaign._id },
      {
        $set: {
          "borne.terminalIds": Array.from(terminalIdSet),
          updatedAt: now,
        },
      },
    );
  }
  console.log(
    `[seed:ads] ${created.length} schedules across ${campaigns.length} borne campaigns × terminals`,
  );
  return created;
}

async function seedImpressions(
  pairs: { schedule: AdScheduleDoc; campaign: CampaignDoc; terminal: TerminalDoc }[],
) {
  if (!pairs.length) return;
  const now = new Date();
  const docs: AdImpressionDailyDoc[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(now.getTime() - dayOffset * 24 * 3600_000);
    const date = isoDate(d);
    for (const p of pairs) {
      // Skip days outside the campaign's life range to be realistic.
      if (
        d < p.campaign.startDate ||
        d > p.campaign.endDate ||
        p.campaign.status === "completed"
      ) {
        continue;
      }
      const base = 50 + Math.floor(Math.random() * 250);
      docs.push({
        terminalId: p.schedule.terminalId,
        campaignId: p.schedule.campaignId,
        date,
        impressions: base,
        updatedAt: now,
      });
    }
  }
  if (docs.length) {
    await db.collection(Collections.adImpressionsDaily).insertMany(docs);
  }
  console.log(`[seed:ads] ${docs.length} daily impression rows seeded`);
}

async function seedDemoIssue(
  pairs: { schedule: AdScheduleDoc; campaign: CampaignDoc; terminal: TerminalDoc }[],
) {
  if (!pairs.length) return;
  const partnerUser = await db
    .collection("user")
    .findOne({ email: PARTNER_EMAIL });
  if (!partnerUser) return;
  const first = pairs[0];
  const issue: AdIssueReportDoc = {
    partnerId: first.schedule.partnerId,
    terminalId: first.schedule.terminalId,
    scheduleId: first.schedule._id!.toString(),
    campaignId: first.schedule.campaignId,
    kind: "audio_issue",
    description:
      "Le son coupe de manière intermittente sur la diffusion du soir.",
    status: "open",
    createdAt: new Date(Date.now() - 3 * 3600_000),
    createdBy: partnerUser._id.toString(),
  };
  await db.collection(Collections.adIssueReports).insertOne(issue);
  console.log(`[seed:ads] 1 demo issue report seeded`);
}

async function main() {
  console.log("\n=== seed:ads ===");
  const partnerId = await findPartnerId();
  console.log(`partnerId: ${partnerId}`);

  await wipeAdsForPartner(partnerId);

  const partnerTerminals = (await db
    .collection(Collections.terminals)
    .find({ partnerId })
    .toArray()) as TerminalDoc[];
  if (!partnerTerminals.length) {
    console.warn("[seed:ads] no terminals for partner — run seed:terminals first");
    await mongoClient.close();
    process.exit(0);
  }

  const campaigns = await ensureDemoBorneCampaigns();

  const pairs = await ensureCampaignsAssigned(partnerTerminals, campaigns);
  await seedImpressions(pairs);
  await seedDemoIssue(pairs);

  // Verify
  const scheduleCount = await db
    .collection(Collections.adSchedules)
    .countDocuments({ partnerId });
  if (scheduleCount !== pairs.length) {
    throw new Error(`expected ${pairs.length} schedules, got ${scheduleCount}`);
  }
  console.log(`\n[verify] ✓ ${scheduleCount} ad schedules seeded`);

  await mongoClient.close();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoClient.close();
  } catch {}
  process.exit(1);
});
