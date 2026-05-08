import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { db, mongoClient } from "../src/lib/db";
import {
  Collections,
  TERMINAL_API_KEY_BYTES,
  type MaintenanceWindowDoc,
  type ScreenStatus,
  type TerminalDoc,
  type TerminalEventDoc,
  type TerminalStatus,
  type VenueType,
} from "../src/lib/schemas";

type SeedTerminal = {
  code: string;
  name: string;
  venueType: VenueType;
  address: string;
  city: string;
  coords: { lat: number; lng: number };
  initialStatus: TerminalStatus;
  spraysToday: number;
  screenStatus: ScreenStatus;
  // Minutes ago since last heartbeat. Drives offline detection on read.
  lastHeartbeatMinutesAgo: number;
  withMaintenance?: { reason: string; daysFromNow: number; durationHours: number };
};

const PARTNER_EMAIL = "partner@publeader.local";

const SEED_TERMINALS: SeedTerminal[] = [
  {
    code: "B-PR-006-01",
    name: "Le Sélect",
    venueType: "bar",
    address: "12 rue Vavin, Paris 6e",
    city: "Paris",
    coords: { lat: 48.8421, lng: 2.3289 },
    initialStatus: "online",
    spraysToday: 184,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 2,
  },
  {
    code: "B-AIX-001-02",
    name: "Hôtel Central",
    venueType: "hotel",
    address: "Cours Mirabeau, Aix-en-Provence",
    city: "Aix-en-Provence",
    coords: { lat: 43.5263, lng: 5.4454 },
    initialStatus: "online",
    spraysToday: 121,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 4,
  },
  {
    code: "B-PR-019-03",
    name: "Club Neon",
    venueType: "nightclub",
    address: "Quai de la Loire, Paris 19e",
    city: "Paris",
    coords: { lat: 48.8896, lng: 2.3776 },
    initialStatus: "online",
    spraysToday: 201,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 1,
  },
  {
    code: "B-LYO-007-04",
    name: "FitZone Lyon",
    venueType: "gym",
    address: "Rue Rivet, Lyon 7e",
    city: "Lyon",
    coords: { lat: 45.7333, lng: 4.8333 },
    initialStatus: "maintenance",
    spraysToday: 16,
    screenStatus: "idle",
    lastHeartbeatMinutesAgo: 60,
    withMaintenance: {
      reason: "Remplacement écran LED",
      daysFromNow: 0,
      durationHours: 4,
    },
  },
  {
    code: "B-BOR-002-05",
    name: "Brasserie Lina",
    venueType: "restaurant",
    address: "Place du Parlement, Bordeaux",
    city: "Bordeaux",
    coords: { lat: 44.8412, lng: -0.5732 },
    initialStatus: "online",
    spraysToday: 149,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 3,
  },
  {
    code: "B-NTE-003-06",
    name: "Le Perchoir Nantes",
    venueType: "bar",
    address: "Rue de la Liberté, Nantes",
    city: "Nantes",
    coords: { lat: 47.2173, lng: -1.5534 },
    initialStatus: "online",
    spraysToday: 162,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 5,
  },
  {
    code: "B-TLS-004-07",
    name: "Studio Velvet",
    venueType: "nightclub",
    address: "Cours Jean Jaurès, Toulouse",
    city: "Toulouse",
    coords: { lat: 43.6047, lng: 1.4442 },
    initialStatus: "offline",
    spraysToday: 0,
    screenStatus: "fault",
    lastHeartbeatMinutesAgo: 18 * 60, // 18 hours ago
  },
  {
    code: "B-PR-009-08",
    name: "Grand Hôtel Opéra",
    venueType: "hotel",
    address: "Place de l'Opéra, Paris 9e",
    city: "Paris",
    coords: { lat: 48.8709, lng: 2.3317 },
    initialStatus: "online",
    spraysToday: 98,
    screenStatus: "active",
    lastHeartbeatMinutesAgo: 2,
  },
];

async function findPartnerId(): Promise<string> {
  const user = await db.collection("user").findOne({ email: PARTNER_EMAIL });
  if (!user?.partnerId) {
    throw new Error(
      `partner user ${PARTNER_EMAIL} or its partnerId missing — run seed:users first`,
    );
  }
  return user.partnerId as string;
}

async function wipeTerminalsForPartner(partnerId: string) {
  const existing = (await db
    .collection(Collections.terminals)
    .find({ partnerId })
    .toArray()) as TerminalDoc[];
  if (!existing.length) return;
  const ids = existing.map((t) => t._id!.toString());
  await db
    .collection(Collections.maintenanceWindows)
    .deleteMany({ terminalId: { $in: ids } });
  await db
    .collection(Collections.terminalEvents)
    .deleteMany({ terminalId: { $in: ids } });
  await db.collection(Collections.terminals).deleteMany({ partnerId });
  console.log(`[seed:terminals] wiped ${existing.length} existing terminals + history`);
}

async function createTerminal(
  s: SeedTerminal,
  partnerId: string,
): Promise<{ id: string; rawKey: string }> {
  const rawKey = randomBytes(TERMINAL_API_KEY_BYTES).toString("hex");
  const apiKeyHash = await bcrypt.hash(rawKey, 10);
  const now = new Date();
  const lastHeartbeatAt = new Date(
    now.getTime() - s.lastHeartbeatMinutesAgo * 60_000,
  );
  const doc: TerminalDoc = {
    partnerId,
    code: s.code,
    name: s.name,
    venueType: s.venueType,
    address: s.address,
    city: s.city,
    coords: s.coords,
    apiKeyHash,
    lastHeartbeatAt,
    lastKnownStatus: s.initialStatus,
    spraysToday: s.spraysToday,
    screenStatus: s.screenStatus,
    installedAt: new Date(now.getTime() - 90 * 24 * 3600_000), // 90 days ago
    createdAt: now,
    updatedAt: now,
  };
  const ins = await db.collection(Collections.terminals).insertOne(doc);
  const id = ins.insertedId.toString();

  // Synthetic status event log spanning 30 days for realistic uptime numbers.
  // Mostly online with brief offline blips.
  const events: TerminalEventDoc[] = [];
  events.push({
    terminalId: id,
    type: "online",
    at: new Date(now.getTime() - 30 * 24 * 3600_000),
  });
  // Add a few offline blips
  for (let day = 28; day >= 0; day -= 7) {
    const blipStart = new Date(now.getTime() - day * 24 * 3600_000);
    const blipEnd = new Date(blipStart.getTime() + 5 * 60_000);
    events.push({ terminalId: id, type: "offline", at: blipStart });
    events.push({ terminalId: id, type: "online", at: blipEnd });
  }
  // Final transition matching the seeded current status.
  if (s.initialStatus === "offline") {
    events.push({
      terminalId: id,
      type: "offline",
      at: new Date(now.getTime() - 60 * 60_000),
    });
  }
  await db.collection(Collections.terminalEvents).insertMany(events);

  // Optional maintenance window.
  if (s.withMaintenance) {
    const startsAt = new Date(
      now.getTime() + s.withMaintenance.daysFromNow * 24 * 3600_000,
    );
    const endsAt = new Date(
      startsAt.getTime() + s.withMaintenance.durationHours * 3600_000,
    );
    const win: MaintenanceWindowDoc = {
      terminalId: id,
      startsAt,
      endsAt,
      reason: s.withMaintenance.reason,
      status: startsAt <= now && endsAt >= now ? "active" : "scheduled",
      createdBy: "seed",
      createdAt: now,
    };
    await db.collection(Collections.maintenanceWindows).insertOne(win);
  }

  return { id, rawKey };
}

async function main() {
  console.log("\n=== seed:terminals ===");
  const partnerId = await findPartnerId();
  console.log(`partnerId: ${partnerId}`);

  await wipeTerminalsForPartner(partnerId);

  console.log("\n=== creating terminals ===");
  const created: { code: string; id: string; rawKey: string }[] = [];
  for (const s of SEED_TERMINALS) {
    const { id, rawKey } = await createTerminal(s, partnerId);
    created.push({ code: s.code, id, rawKey });
    console.log(`  [${s.code}] ${s.name} — ${s.initialStatus}`);
  }

  // Verify
  const count = await db
    .collection(Collections.terminals)
    .countDocuments({ partnerId });
  if (count !== SEED_TERMINALS.length) {
    throw new Error(`expected ${SEED_TERMINALS.length} terminals, got ${count}`);
  }
  console.log(`\n[verify] ✓ ${count} terminals seeded for partner ${partnerId}`);

  console.log("\n=== device API keys (shown once) ===");
  for (const c of created) {
    console.log(`  ${c.code}: ${c.rawKey}`);
  }
  console.log("\nUse: curl -X POST .../api/terminals/heartbeat -H 'X-Terminal-Key: <key>' -H 'Content-Type: application/json' -d '{\"terminalCode\":\"<code>\",\"spraysToday\":1}'");

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
