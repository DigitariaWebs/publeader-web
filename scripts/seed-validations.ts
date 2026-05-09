/**
 * AD1 — Seed pending entities for the admin validations queue.
 *
 * Creates pending drivers + companies + partners with linked Better Auth
 * users (status: "pending", emailVerified: false). They cannot login until
 * an admin validates the dossier — by design.
 */
import { auth } from "../src/lib/auth";
import { db, mongoClient } from "../src/lib/db";
import { Collections, REQUIRED_DOC_TYPES } from "../src/lib/schemas";

type PendingDriver = {
  email: string;
  password: string;
  name: string;
  phone: string;
  firstName: string;
  lastName: string;
  city: string;
  // How many of the 5 required doc types are uploaded (status pending awaiting review).
  docsUploaded: number;
};

type PendingCompany = {
  email: string;
  password: string;
  name: string;
  phone: string;
  companyName: string;
  contactName: string;
  domain: string;
  sector: string;
  city: string;
  legalName?: string;
  siret?: string;
  vatNumber?: string;
  legalForm?: "SARL" | "SAS" | "SA" | "EURL" | "Auto-entrepreneur" | "Autre";
  website?: string;
  description?: string;
};

type PendingPartner = {
  email: string;
  password: string;
  name: string;
  phone: string;
  businessName: string;
  managerName: string;
  address: string;
  city: string;
  openingHours?: string;
};

const DRIVERS: PendingDriver[] = [
  {
    email: "karim.benali@example.com",
    password: "pending123!",
    name: "Karim Benali",
    phone: "+33 6 11 22 33 44",
    firstName: "Karim",
    lastName: "Benali",
    city: "Lyon",
    docsUploaded: 5, // all docs in, ready for review
  },
  {
    email: "sophie.martin@example.com",
    password: "pending123!",
    name: "Sophie Martin",
    phone: "+33 6 22 33 44 55",
    firstName: "Sophie",
    lastName: "Martin",
    city: "Marseille",
    docsUploaded: 3, // partial — admin will need to wait
  },
  {
    email: "mehdi.cherif@example.com",
    password: "pending123!",
    name: "Mehdi Cherif",
    phone: "+33 6 33 44 55 66",
    firstName: "Mehdi",
    lastName: "Cherif",
    city: "Toulouse",
    docsUploaded: 5,
  },
];

const COMPANIES: PendingCompany[] = [
  {
    email: "contact@nova-cosmetique.example",
    password: "pending123!",
    name: "Léa Garnier",
    phone: "+33 1 45 67 89 12",
    companyName: "Nova Cosmétique",
    contactName: "Léa Garnier",
    domain: "Cosmétique",
    sector: "B2C",
    city: "Paris",
    legalName: "Nova Cosmétique SAS",
    siret: "85123456700017",
    vatNumber: "FR42851234567",
    legalForm: "SAS",
    website: "https://nova-cosmetique.example",
    description: "Marque française de cosmétiques naturels.",
  },
  {
    email: "direction@chateau-bellevue.example",
    password: "pending123!",
    name: "Antoine Rivet",
    phone: "+33 5 56 78 90 12",
    companyName: "Château de Bellevue",
    contactName: "Antoine Rivet",
    domain: "Vins & spiritueux",
    sector: "Hospitalité",
    city: "Bordeaux",
    legalName: "SCEA Château de Bellevue",
    siret: "78912345600014",
    legalForm: "Autre",
    description: "Vignoble familial AOC Bordeaux.",
  },
];

const PARTNERS: PendingPartner[] = [
  {
    email: "ops@lounge-bellecour.example",
    password: "pending123!",
    name: "Hugo Pellegrin",
    phone: "+33 4 78 90 11 22",
    businessName: "Lounge Bellecour",
    managerName: "Hugo Pellegrin",
    address: "12 place Bellecour",
    city: "Lyon",
    openingHours: "18h - 2h",
  },
  {
    email: "manager@spa-azur.example",
    password: "pending123!",
    name: "Inès Roussel",
    phone: "+33 4 93 12 34 56",
    businessName: "Spa Azur",
    managerName: "Inès Roussel",
    address: "27 promenade des Anglais",
    city: "Nice",
    openingHours: "10h - 21h",
  },
];

async function wipeByEmail(email: string) {
  const existing = await db.collection("user").findOne({ email });
  if (!existing) return;
  const userIdStr = existing._id.toString();
  const driverDoc = await db
    .collection(Collections.drivers)
    .findOne({ userId: userIdStr });
  if (driverDoc) {
    const driverId = driverDoc._id.toString();
    await db.collection(Collections.documents).deleteMany({ driverId });
    await db.collection(Collections.vehicles).deleteMany({ driverId });
  }
  await db.collection("session").deleteMany({ userId: userIdStr });
  await db.collection("account").deleteMany({ userId: userIdStr });
  await db.collection(Collections.drivers).deleteMany({ userId: userIdStr });
  await db.collection(Collections.companies).deleteMany({ userId: userIdStr });
  await db.collection(Collections.partners).deleteMany({ userId: userIdStr });
  await db.collection("user").deleteOne({ _id: existing._id });
  console.log(`[seed:validations] wiped existing ${email}`);
}

async function createPendingUser(opts: {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: "driver" | "advertiser" | "partner";
}): Promise<string> {
  await auth.api.signUpEmail({
    body: { email: opts.email, password: opts.password, name: opts.name },
    asResponse: false,
  });
  const created = await db.collection("user").findOne({ email: opts.email });
  if (!created) {
    throw new Error(`signUpEmail failed for ${opts.email}`);
  }
  await db.collection("user").updateOne(
    { email: opts.email },
    {
      $set: {
        role: opts.role,
        status: "pending",
        emailVerified: false,
        phone: opts.phone,
      },
    },
  );
  return created._id.toString();
}

async function createPendingDriver(d: PendingDriver) {
  const userId = await createPendingUser({
    email: d.email,
    password: d.password,
    name: d.name,
    phone: d.phone,
    role: "driver",
  });
  const now = new Date();
  const ins = await db.collection(Collections.drivers).insertOne({
    userId,
    firstName: d.firstName,
    lastName: d.lastName,
    phone: d.phone,
    city: d.city,
    status: "pending",
    joinedAt: now,
    campaignsDone: 0,
    rating: 0,
    totalKm: 0,
    totalEarningsCents: 0,
    availableBalanceCents: 0,
    pendingBalanceCents: 0,
    withdrawnTotalCents: 0,
    documentsApproved: false,
  });
  const driverId = ins.insertedId.toString();
  await db
    .collection("user")
    .updateOne({ email: d.email }, { $set: { driverId } });

  // Synthetic uploaded documents (status: pending — awaiting admin review).
  for (let i = 0; i < d.docsUploaded; i++) {
    const type = REQUIRED_DOC_TYPES[i];
    await db.collection(Collections.documents).insertOne({
      driverId,
      type,
      status: "pending",
      files: [
        {
          publicId: `seed/${driverId}/${type}`,
          url: `https://res.cloudinary.com/demo/image/upload/sample.jpg`,
          resourceType: "image",
          format: "jpg",
          bytes: 120_000,
          uploadedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(
    `[seed:validations] driver ${d.email} (${d.docsUploaded}/${REQUIRED_DOC_TYPES.length} docs)`,
  );
}

async function createPendingCompany(c: PendingCompany) {
  const userId = await createPendingUser({
    email: c.email,
    password: c.password,
    name: c.name,
    phone: c.phone,
    role: "advertiser",
  });
  const ins = await db.collection(Collections.companies).insertOne({
    userId,
    companyName: c.companyName,
    contactName: c.contactName,
    phone: c.phone,
    domain: c.domain,
    sector: c.sector,
    city: c.city,
    website: c.website,
    description: c.description,
    legalName: c.legalName,
    siret: c.siret,
    vatNumber: c.vatNumber,
    legalForm: c.legalForm,
    status: "pending",
    budgetTotal: 0,
    campaignsCount: 0,
    createdAt: new Date(),
  });
  await db
    .collection("user")
    .updateOne({ email: c.email }, { $set: { companyId: ins.insertedId.toString() } });
  console.log(`[seed:validations] company ${c.email}`);
}

async function createPendingPartner(p: PendingPartner) {
  const userId = await createPendingUser({
    email: p.email,
    password: p.password,
    name: p.name,
    phone: p.phone,
    role: "partner",
  });
  const ins = await db.collection(Collections.partners).insertOne({
    userId,
    businessName: p.businessName,
    managerName: p.managerName,
    phone: p.phone,
    address: p.address,
    city: p.city,
    openingHours: p.openingHours,
    status: "pending",
    createdAt: new Date(),
  });
  await db
    .collection("user")
    .updateOne({ email: p.email }, { $set: { partnerId: ins.insertedId.toString() } });
  console.log(`[seed:validations] partner ${p.email}`);
}

async function main() {
  console.log("\n=== seed:validations ===");
  console.log("\n[wipe] removing existing pending fixtures…");
  for (const d of DRIVERS) await wipeByEmail(d.email);
  for (const c of COMPANIES) await wipeByEmail(c.email);
  for (const p of PARTNERS) await wipeByEmail(p.email);

  console.log("\n[create] pending drivers…");
  for (const d of DRIVERS) await createPendingDriver(d);
  console.log("\n[create] pending companies…");
  for (const c of COMPANIES) await createPendingCompany(c);
  console.log("\n[create] pending partners…");
  for (const p of PARTNERS) await createPendingPartner(p);

  // Verify counts
  const dCount = await db
    .collection(Collections.drivers)
    .countDocuments({ status: "pending" });
  const cCount = await db
    .collection(Collections.companies)
    .countDocuments({ status: "pending" });
  const pCount = await db
    .collection(Collections.partners)
    .countDocuments({ status: "pending" });
  console.log(
    `\n[verify] ✓ pending drivers=${dCount} companies=${cCount} partners=${pCount}`,
  );

  await mongoClient.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoClient.close();
  } catch {}
  process.exit(1);
});
