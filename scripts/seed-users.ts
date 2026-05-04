import { auth } from "../src/lib/auth";
import { db, mongoClient } from "../src/lib/db";
import { Collections } from "../src/lib/schemas";
import { ObjectId } from "mongodb";

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
    email: "admin@driveads.local",
    password: "admin123!",
    name: "Claire Lemoine",
    role: "admin",
    phone: "+33 1 00 00 00 00",
  },
  {
    email: "driver@driveads.local",
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
    email: "advertiser@driveads.local",
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
    email: "partner@driveads.local",
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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function ensureUser(u: DemoUser) {
  const existing = await db.collection("user").findOne({ email: u.email });
  if (existing) {
    console.log(`[seed] ${u.email} already exists, ensuring role/status…`);
    await db.collection("user").updateOne(
      { _id: existing._id },
      {
        $set: {
          role: u.role,
          status: "validated",
          emailVerified: true,
          phone: u.phone ?? existing.phone,
        },
      },
    );
    return existing._id.toString();
  }

  const result = await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
    asResponse: false,
  });
  const userId = result.user.id;

  await db.collection("user").updateOne(
    { _id: userId } as never,
    {
      $set: {
        role: u.role,
        status: "validated",
        emailVerified: true,
        phone: u.phone ?? null,
      },
    },
  );
  return userId;
}

async function ensureDriver(userId: string, u: DemoUser) {
  if (!u.driver) return;
  const existing = await db
    .collection(Collections.drivers)
    .findOne({ userId });
  if (existing) {
    console.log(`[seed] driver doc exists for ${u.email}`);
    await db.collection("user").updateOne(
      { _id: userId } as never,
      { $set: { driverId: existing._id.toString() } },
    );
    return;
  }

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
  await db.collection("user").updateOne(
    { _id: userId } as never,
    { $set: { driverId: ins.insertedId.toString() } },
  );
  console.log(`[seed] driver linked: ${u.email}`);
}

async function ensureCompany(userId: string, u: DemoUser, headers: Headers) {
  if (!u.company) return;
  const existing = await db
    .collection(Collections.companies)
    .findOne({ userId });
  if (existing) {
    console.log(`[seed] company doc exists for ${u.email}`);
    await db.collection("user").updateOne(
      { _id: userId } as never,
      { $set: { companyId: existing._id.toString() } },
    );
    return;
  }

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
  const companyId = ins.insertedId.toString();

  let organizationId: string | undefined;
  try {
    const orgSlug = `${slugify(u.company.companyName)}-${companyId.slice(-6)}`;
    const org = await auth.api.createOrganization({
      headers,
      body: { name: u.company.companyName, slug: orgSlug, userId },
    });
    organizationId = (org as { id?: string } | null)?.id;
    if (organizationId) {
      await db
        .collection(Collections.companies)
        .updateOne({ _id: ins.insertedId }, { $set: { organizationId } });
    }
  } catch (e) {
    console.warn(`[seed] organization create failed for ${u.email}`, e);
  }

  await db.collection("user").updateOne(
    { _id: userId } as never,
    { $set: { companyId } },
  );
  console.log(`[seed] company linked: ${u.email} (org=${organizationId ?? "n/a"})`);
}

async function ensurePartner(userId: string, u: DemoUser) {
  if (!u.partner) return;
  const existing = await db
    .collection(Collections.partners)
    .findOne({ userId });
  if (existing) {
    console.log(`[seed] partner doc exists for ${u.email}`);
    await db.collection("user").updateOne(
      { _id: userId } as never,
      { $set: { partnerId: existing._id.toString() } },
    );
    return;
  }

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
  await db.collection("user").updateOne(
    { _id: userId } as never,
    { $set: { partnerId: ins.insertedId.toString() } },
  );
  console.log(`[seed] partner linked: ${u.email}`);
}

async function main() {
  const headers = new Headers();
  for (const u of DEMO_USERS) {
    const userId = await ensureUser(u);
    if (u.role === "driver") await ensureDriver(userId, u);
    if (u.role === "advertiser") await ensureCompany(userId, u, headers);
    if (u.role === "partner") await ensurePartner(userId, u);
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
