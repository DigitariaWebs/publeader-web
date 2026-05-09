import { ObjectId } from "mongodb";
import { db } from "../../db";
import {
  Collections,
  type DriverDoc,
  type TransactionDoc,
} from "../../schemas";
import {
  createReportDoc,
  drawHeader,
  drawKeyValues,
  drawSectionTitle,
  drawTable,
  eur,
  fmtNumber,
} from "../pdf-utils";
import {
  endOfDay,
  formatPeriodSlug,
  startOfDay,
  type ReportBuilder,
  type ReportPeriod,
} from "../types";

type Row = {
  driverId: string;
  name: string;
  city: string;
  status: string;
  rating: number;
  campaignsInPeriod: number;
  earningsCents: number;
  totalKm: number;
};

const TOP_LIMIT = 100;

async function buildDriverActivity(period: ReportPeriod): Promise<Buffer> {
  const start = startOfDay(period.start);
  const end = endOfDay(period.end);

  // Pull all completion txs in window so we can credit drivers who only
  // earned in this period (newcomers don't otherwise appear in the drivers
  // collection's lifetime aggregates).
  const txs = (await db
    .collection(Collections.transactions)
    .find({
      type: "campaign_completion",
      createdAt: { $gte: start, $lte: end },
    })
    .toArray()) as TransactionDoc[];

  const earningsByDriver = new Map<string, number>();
  const campaignsByDriver = new Map<string, number>();
  txs.forEach((t) => {
    earningsByDriver.set(
      t.driverId,
      (earningsByDriver.get(t.driverId) ?? 0) + Math.max(0, t.amountCents),
    );
    campaignsByDriver.set(
      t.driverId,
      (campaignsByDriver.get(t.driverId) ?? 0) + 1,
    );
  });

  const driverIds = [...earningsByDriver.keys()].filter((id) =>
    ObjectId.isValid(id),
  );

  const drivers = driverIds.length
    ? ((await db
        .collection(Collections.drivers)
        .find({ _id: { $in: driverIds.map((id) => new ObjectId(id)) } })
        .toArray()) as DriverDoc[])
    : [];

  const rows: Row[] = drivers.map((d) => {
    const id = d._id!.toString();
    return {
      driverId: id,
      name: `${d.firstName} ${d.lastName}`,
      city: d.city,
      status: d.status,
      rating: d.rating,
      campaignsInPeriod: campaignsByDriver.get(id) ?? 0,
      earningsCents: earningsByDriver.get(id) ?? 0,
      totalKm: d.totalKm,
    };
  });

  rows.sort((a, b) => b.earningsCents - a.earningsCents);
  const top = rows.slice(0, TOP_LIMIT);

  const totalEarnings = rows.reduce((a, r) => a + r.earningsCents, 0);
  const totalCompletions = txs.length;
  const avgRating =
    rows.length > 0
      ? rows.reduce((a, r) => a + (Number.isFinite(r.rating) ? r.rating : 0), 0) /
        rows.length
      : 0;

  const { doc, finish } = createReportDoc();
  drawHeader(doc, "Activité chauffeurs", period);

  drawSectionTitle(doc, "Synthèse");
  drawKeyValues(doc, [
    { label: "Chauffeurs actifs", value: fmtNumber(rows.length) },
    { label: "Campagnes complétées", value: fmtNumber(totalCompletions) },
    { label: "Commissions versées", value: eur(totalEarnings) },
    { label: "Note moyenne", value: avgRating.toFixed(2) },
  ]);

  doc.moveDown(0.5);
  drawSectionTitle(
    doc,
    `Top performeurs (par commissions, ${rows.length > TOP_LIMIT ? `top ${TOP_LIMIT} sur ${rows.length}` : `${rows.length} chauffeurs`})`,
  );
  if (top.length === 0) {
    doc.fontSize(9).fillColor("#666").text("Aucune activité chauffeur sur la période.");
  } else {
    drawTable(
      doc,
      [
        { header: "Chauffeur", width: 160, render: (r: Row) => r.name },
        { header: "Ville", width: 90, render: (r: Row) => r.city },
        { header: "Statut", width: 70, render: (r: Row) => r.status },
        {
          header: "Camp.",
          width: 50,
          render: (r: Row) => fmtNumber(r.campaignsInPeriod),
          align: "right",
        },
        {
          header: "Note",
          width: 45,
          render: (r: Row) => r.rating.toFixed(1),
          align: "right",
        },
        {
          header: "Gains",
          width: 80,
          render: (r: Row) => eur(r.earningsCents),
          align: "right",
        },
      ],
      top,
    );
  }

  return finish();
}

export const driverActivityBuilder: ReportBuilder = {
  type: "driver_activity",
  async build(period) {
    const buffer = await buildDriverActivity(period);
    return {
      buffer,
      filename: `activite-chauffeurs-${formatPeriodSlug(period)}.pdf`,
      contentType: "application/pdf",
      format: "pdf",
    };
  },
};
