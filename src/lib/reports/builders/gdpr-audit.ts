import { db } from "../../db";
import { Collections } from "../../schemas";
import {
  createReportDoc,
  drawHeader,
  drawSectionTitle,
  drawTable,
  fmtDate,
  fmtNumber,
} from "../pdf-utils";
import {
  formatPeriodSlug,
  type ReportBuilder,
  type ReportPeriod,
} from "../types";

// Static inventory of PII / personal-data exposure per collection. Update
// when schema changes — there is no automated discovery. Retention is the
// project's stated policy; revisit alongside legal each year.
type GdprEntry = {
  collection: string;
  category: "user" | "operational" | "financial" | "telemetry";
  piiFields: string;
  legalBasis: string;
  retention: string;
};

const INVENTORY: GdprEntry[] = [
  {
    collection: "user (better-auth)",
    category: "user",
    piiFields: "email, name, password hash, role",
    legalBasis: "Contrat (CGU)",
    retention: "Compte actif + 3 ans après dernière connexion",
  },
  {
    collection: Collections.drivers,
    category: "user",
    piiFields:
      "firstName, lastName, phone, city, bankAccount.iban, totalKm, rating",
    legalBasis: "Contrat (mission chauffeur)",
    retention: "Durée du contrat + 5 ans (obligation comptable)",
  },
  {
    collection: Collections.companies,
    category: "user",
    piiFields:
      "companyName, contactName, phone, siret, vatNumber, legalName, headquarters",
    legalBasis: "Contrat (mission annonceur) / Obligation légale",
    retention: "Durée du contrat + 10 ans (factures)",
  },
  {
    collection: Collections.partners,
    category: "user",
    piiFields: "businessName, managerName, phone, address",
    legalBasis: "Contrat (mission partenaire)",
    retention: "Durée du contrat + 5 ans",
  },
  {
    collection: Collections.documents,
    category: "user",
    piiFields: "Pièces d'identité, justificatifs (Cloudinary URL)",
    legalBasis: "Obligation légale (KYC)",
    retention: "10 ans après fin de relation",
  },
  {
    collection: Collections.vehicles,
    category: "operational",
    piiFields: "licensePlate, contrôle technique",
    legalBasis: "Contrat",
    retention: "Durée du contrat + 1 an",
  },
  {
    collection: Collections.transactions,
    category: "financial",
    piiFields: "driverId, montants (cents)",
    legalBasis: "Obligation légale (comptabilité)",
    retention: "10 ans (Code de commerce)",
  },
  {
    collection: Collections.withdrawals,
    category: "financial",
    piiFields: "iban, bankName, accountHolder, payoutReference",
    legalBasis: "Obligation légale",
    retention: "10 ans",
  },
  {
    collection: Collections.invoices,
    category: "financial",
    piiFields: "companyId, sentTo (email), paidReference",
    legalBasis: "Obligation légale",
    retention: "10 ans",
  },
  {
    collection: Collections.expenses,
    category: "financial",
    piiFields: "vendor, label, notes",
    legalBasis: "Obligation légale",
    retention: "10 ans",
  },
  {
    collection: Collections.terminals,
    category: "telemetry",
    piiFields: "Aucune (matériel) — coords GPS approximatives",
    legalBasis: "Intérêt légitime",
    retention: "Durée d'exploitation",
  },
  {
    collection: Collections.refillLogs,
    category: "operational",
    piiFields: "refilledBy (admin), notes",
    legalBasis: "Intérêt légitime (audit)",
    retention: "3 ans",
  },
  {
    collection: Collections.adImpressionsDaily,
    category: "telemetry",
    piiFields: "Aucune (compteurs anonymes par borne)",
    legalBasis: "Intérêt légitime",
    retention: "5 ans (rétention statistique)",
  },
  {
    collection: Collections.stripeEvents,
    category: "financial",
    piiFields: "Métadonnées Stripe (IDs paiement, montants)",
    legalBasis: "Obligation légale",
    retention: "10 ans",
  },
];

async function countAll(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all(
    INVENTORY.map(async (e) => {
      // user collection name uses better-auth's literal "user"; fall back to
      // counting on whatever we have.
      const name =
        e.collection.startsWith("user")
          ? "user"
          : e.collection;
      try {
        const n = await db.collection(name).countDocuments({});
        out.set(e.collection, n);
      } catch {
        out.set(e.collection, 0);
      }
    }),
  );
  return out;
}

async function buildGdprAudit(period: ReportPeriod): Promise<Buffer> {
  const counts = await countAll();
  const { doc, finish } = createReportDoc();
  drawHeader(doc, "Audit RGPD — Inventaire & rétention", period);

  doc
    .fontSize(10)
    .fillColor("#444")
    .text(
      `Snapshot généré le ${fmtDate(new Date())}. Sources : collections MongoDB applicatives. Document destiné au registre des traitements.`,
      50,
      doc.y,
      { width: 495 },
    );
  doc.moveDown(1);

  const groups: Record<GdprEntry["category"], string> = {
    user: "Données personnelles",
    operational: "Données opérationnelles",
    financial: "Données financières",
    telemetry: "Télémétrie / agrégats",
  };

  (Object.keys(groups) as GdprEntry["category"][]).forEach((cat) => {
    const rows = INVENTORY.filter((e) => e.category === cat);
    if (rows.length === 0) return;
    drawSectionTitle(doc, groups[cat]);
    drawTable(
      doc,
      [
        { header: "Collection", width: 110, render: (r: GdprEntry) => r.collection },
        {
          header: "Champs PII",
          width: 165,
          render: (r: GdprEntry) => r.piiFields,
        },
        {
          header: "Base légale",
          width: 90,
          render: (r: GdprEntry) => r.legalBasis,
        },
        {
          header: "Rétention",
          width: 90,
          render: (r: GdprEntry) => r.retention,
        },
        {
          header: "Lignes",
          width: 40,
          render: (r: GdprEntry) => fmtNumber(counts.get(r.collection) ?? 0),
          align: "right",
        },
      ],
      rows,
    );
    doc.moveDown(0.5);
  });

  return finish();
}

export const gdprAuditBuilder: ReportBuilder = {
  type: "gdpr_audit",
  async build(period) {
    const buffer = await buildGdprAudit(period);
    return {
      buffer,
      filename: `audit-rgpd-${formatPeriodSlug(period)}.pdf`,
      contentType: "application/pdf",
      format: "pdf",
    };
  },
};
