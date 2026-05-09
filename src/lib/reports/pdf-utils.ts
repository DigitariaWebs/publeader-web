import PDFDocument from "pdfkit";
import type { ReportPeriod } from "./types";

export const eur = (cents: number): string =>
  `${(cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

export const fmtDate = (d: Date | string): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const fmtNumber = (n: number): string =>
  n.toLocaleString("fr-FR");

export type PdfDoc = InstanceType<typeof PDFDocument>;

export function createReportDoc(): {
  doc: PdfDoc;
  finish: () => Promise<Buffer>;
} {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  return {
    doc,
    finish: () =>
      new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
      }),
  };
}

export function drawHeader(doc: PdfDoc, title: string, period: ReportPeriod) {
  doc
    .fontSize(20)
    .fillColor("#0F1B3F")
    .text("Publeader", 50, 50, { continued: true })
    .fillColor("#666")
    .fontSize(10)
    .text("  ·  Rapport", { align: "left" });

  doc
    .fontSize(14)
    .fillColor("#0F1B3F")
    .text(title, 50, 90);

  doc
    .fontSize(9)
    .fillColor("#666")
    .text(
      `Période : ${fmtDate(period.start)} → ${fmtDate(period.end)}`,
      50,
      112,
    );
  doc
    .fontSize(8)
    .fillColor("#999")
    .text(`Généré le ${fmtDate(new Date())}`, 50, 126);

  doc.moveTo(50, 145).lineTo(545, 145).strokeColor("#E5E7EB").stroke();
  doc.moveDown(2);
  doc.y = 160;
}

export function drawSectionTitle(doc: PdfDoc, label: string) {
  if (doc.y > 720) doc.addPage();
  doc
    .fontSize(12)
    .fillColor("#0F1B3F")
    .text(label, 50, doc.y);
  doc.moveDown(0.4);
}

// Renders a simple key/value pair list (one per line). For headline KPIs.
export function drawKeyValues(
  doc: PdfDoc,
  rows: { label: string; value: string }[],
) {
  rows.forEach(({ label, value }) => {
    if (doc.y > 760) doc.addPage();
    const y = doc.y;
    doc.fontSize(10).fillColor("#444").text(label, 50, y);
    doc.fontSize(10).fillColor("#0F1B3F").text(value, 300, y);
    doc.moveDown(0.6);
  });
}

// Renders a tabular block with a header row and rows. Column widths are
// expressed in absolute points; total should be <= 495 (page minus margins).
export type TableColumn<T> = {
  header: string;
  width: number;
  render: (row: T) => string;
  align?: "left" | "right";
};

export function drawTable<T>(
  doc: PdfDoc,
  columns: TableColumn<T>[],
  rows: T[],
) {
  const startX = 50;
  const rowHeight = 16;

  const drawHeaderRow = () => {
    let x = startX;
    doc.fillColor("#0F1B3F").fontSize(9);
    columns.forEach((col) => {
      doc.text(col.header, x, doc.y, {
        width: col.width,
        align: col.align ?? "left",
        continued: false,
      });
      x += col.width;
    });
    doc.moveDown(0.2);
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + columns.reduce((a, c) => a + c.width, 0), doc.y)
      .strokeColor("#D1D5DB")
      .stroke();
    doc.moveDown(0.3);
  };

  drawHeaderRow();

  rows.forEach((row) => {
    if (doc.y > 760) {
      doc.addPage();
      drawHeaderRow();
    }
    let x = startX;
    const yStart = doc.y;
    doc.fillColor("#1F2937").fontSize(9);
    columns.forEach((col) => {
      doc.text(col.render(row), x, yStart, {
        width: col.width,
        align: col.align ?? "left",
      });
      x += col.width;
    });
    doc.y = yStart + rowHeight;
  });

  doc.moveDown(0.5);
}
