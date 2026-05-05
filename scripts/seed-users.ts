import { auth } from "../src/lib/auth";
import { db, mongoClient } from "../src/lib/db";
import { Collections } from "../src/lib/schemas";

type DemoUser = {
  email: string;
  password: string;
  name: string;
  role: "admin" | "driver" | "advertiser" | "partner";
  phone?: string;
  driver?: {
    firstName: string;
    lastName: string;
    city: string;
    vehicleModel: string;
    vehicleYear: string;
    licensePlate: string;
    vehicleType: string;
  };
  company?: {
    companyName: string;
    contactName: string;
    domain: string;
    sector: string;
    city: string;
    website?: string;
    description?: string;
  };
  partner?: {
    businessName: string;
    managerName: string;
    address: string;
    city: string;
    openingHours?: string;
  };
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "admin@publeader.local",
    password: "admin123!",
    name: "Claire Lemoine",
    role: "admin",
    phone: "+33 1 00 00 00 00",
  },
  {
    email: "driver@publeader.local",
    password: "driver123!",
    name: "Marie Dupont",
    role: "driver",
    phone: "+33 6 12 34 56 78",
    driver: {
      firstName: "Marie",
      lastName: "Dupont",
      city: "Paris",
      vehicleModel: "Peugeot 308",
      vehicleYear: "2022",
      licensePlate: "AB-123-CD",
      vehicleType: "Berline",
    },
  },
  {
    email: "advertiser@publeader.local",
    password: "advert123!",
    name: "Jean Dupont",
    role: "advertiser",
    phone: "+33 1 42 00 12 34",
    company: {
      companyName: "Acme Corp",
      contactName: "Jean Dupont",
      domain: "Restauration",
      sector: "B2C",
      city: "Paris",
      website: "https://acme.example.com",
      description: "Chaîne de restauration rapide premium",
    },
  },
  {
    email: "partner@publeader.local",
    password: "partner123!",
    name: "Yanis Haddad",
    role: "partner",
    phone: "+33 1 42 00 18 44",
    partner: {
      businessName: "Club Neon",
      managerName: "Yanis Haddad",
      address: "18 rue Montorgueil",
      city: "Paris",
      openingHours: "20h - 4h",
    },
  },
];

async function wipeUser(email: string) {
  const existing = await db.collection("user").findOne({ email });
  if (!existing) return;
  const userId = existing._id;
  const userIdStr = userId.toString();

  await db.collection("session").deleteMany({ userId: userIdStr });
  await db.collection("account").deleteMany({ userId: userIdStr });
  await db.collection(Collections.drivers).deleteMany({ userId: userIdStr });
  await db.collection(Collections.companies).deleteMany({ userId: userIdStr });
  await db.collection(Collections.partners).deleteMany({ userId: userIdStr });
  await db.collection("user").deleteOne({ _id: userId });
  console.log(`[seed] wiped existing ${email}`);
}

async function createUser(u: DemoUser): Promise<string> {
  await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
    asResponse: false,
  });

  // Re-fetch by email — Better Auth may store _id as ObjectId or string,
  // looking up by email is the only safe path that always matches.
  const created = await db.collection("user").findOne({ email: u.email });
  if (!created) {
    throw new Error(`signUpEmail succeeded but user ${u.email} not found in DB`);
  }

  const updateRes = await db.collection("user").updateOne(
    { email: u.email },
    {
      $set: {
        role: u.role,
        status: "validated",
        emailVerified: true,
        phone: u.phone ?? null,
      },
    },
  );

  if (updateRes.matchedCount === 0) {
    throw new Error(`failed to set role/status for ${u.email}`);
  }

  return created._id.toString();
}

async function createDriver(userId: string, u: DemoUser) {
  if (!u.driver) return;
  const ins = await db.collection(Collections.drivers).insertOne({
    userId,
    firstName: u.driver.firstName,
    lastName: u.driver.lastName,
    phone: u.phone ?? "",
    city: u.driver.city,
    vehicleModel: u.driver.vehicleModel,
    vehicleYear: u.driver.vehicleYear,
    licensePlate: u.driver.licensePlate,
    vehicleType: u.driver.vehicleType,
    status: "validated",
    joinedAt: new Date(),
    campaignsDone: 12,
    rating: 4.9,
    totalKm: 18500,
    totalEarnings: 4320,
    documentsUploaded: true,
  });
  await db
    .collection("user")
    .updateOne(
      { email: u.email },
      { $set: { driverId: ins.insertedId.toString() } },
    );
  console.log(`[seed] driver linked: ${u.email}`);
}

async function createCompany(userId: string, u: DemoUser) {
  if (!u.company) return;
  const ins = await db.collection(Collections.companies).insertOne({
    userId,
    companyName: u.company.companyName,
    contactName: u.company.contactName,
    phone: u.phone ?? "",
    domain: u.company.domain,
    sector: u.company.sector,
    city: u.company.city,
    website: u.company.website,
    description: u.company.description,
    status: "validated",
    budgetTotal: 50000,
    campaignsCount: 0,
    createdAt: new Date(),
  });
  await db
    .collection("user")
    .updateOne(
      { email: u.email },
      { $set: { companyId: ins.insertedId.toString() } },
    );
  console.log(`[seed] company linked: ${u.email}`);
}

async function createPartner(userId: string, u: DemoUser) {
  if (!u.partner) return;
  const ins = await db.collection(Collections.partners).insertOne({
    userId,
    businessName: u.partner.businessName,
    managerName: u.partner.managerName,
    phone: u.phone ?? "",
    address: u.partner.address,
    city: u.partner.city,
    openingHours: u.partner.openingHours,
    monthlySprayRevenue: 1240,
    monthlyAdsRevenue: 430,
    status: "validated",
    createdAt: new Date(),
  });
  await db
    .collection("user")
    .updateOne(
      { email: u.email },
      { $set: { partnerId: ins.insertedId.toString() } },
    );
  console.log(`[seed] partner linked: ${u.email}`);
}

async function verifyUser(u: DemoUser) {
  const user = await db.collection("user").findOne({ email: u.email });
  if (!user) throw new Error(`[verify] missing user: ${u.email}`);
  if (user.role !== u.role) throw new Error(`[verify] ${u.email} role=${user.role}, expected ${u.role}`);
  if (user.status !== "validated") throw new Error(`[verify] ${u.email} status=${user.status}, expected validated`);
  if (user.emailVerified !== true) throw new Error(`[verify] ${u.email} emailVerified=${user.emailVerified}, expected true`);

  const account = await db.collection("account").findOne({ userId: user._id.toString() });
  const accountAlt = account ?? (await db.collection("account").findOne({ userId: user._id }));
  if (!accountAlt) throw new Error(`[verify] ${u.email} has no account doc — login will fail`);

  if (u.driver && !user.driverId) throw new Error(`[verify] ${u.email} missing driverId link`);
  if (u.company && !user.companyId) throw new Error(`[verify] ${u.email} missing companyId link`);
  if (u.partner && !user.partnerId) throw new Error(`[verify] ${u.email} missing partnerId link`);

  console.log(`[verify] ✓ ${u.email}`);
}

async function main() {
  console.log("\n=== wiping existing demo users ===");
  for (const u of DEMO_USERS) {
    await wipeUser(u.email);
  }

  console.log("\n=== creating demo users ===");
  for (const u of DEMO_USERS) {
    const userId = await createUser(u);
    if (u.role === "driver") await createDriver(userId, u);
    if (u.role === "advertiser") await createCompany(userId, u);
    if (u.role === "partner") await createPartner(userId, u);
  }

  console.log("\n=== verifying ===");
  for (const u of DEMO_USERS) {
    await verifyUser(u);
  }

  console.log("\n✅ Seed done. Demo credentials:");
  for (const u of DEMO_USERS) {
    console.log(`  [${u.role.padEnd(10)}] ${u.email} / ${u.password}`);
  }

  await mongoClient.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoClient.close(); } catch {}
  process.exit(1);
});
