import PDFDocument from "pdfkit";
import type { CompanyDoc } from "./schemas";
import type { InvoiceView } from "./invoice-service";

const eur = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const STATUS_LABEL: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
};

export type InvoicePdfInput = {
  invoice: InvoiceView;
  company: CompanyDoc;
};

export async function buildInvoicePDF(input: InvoicePdfInput): Promise<Buffer> {
  const { invoice, company } = input;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc
      .fontSize(20)
      .fillColor("#0F1B3F")
      .text("Publeader", 50, 50, { continued: true })
      .fillColor("#666")
      .fontSize(10)
      .text("  ·  Facture", { align: "left" });

    doc
      .fontSize(11)
      .fillColor("#000")
      .text(invoice.ref, 400, 55, { align: "right", width: 145 });
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(STATUS_LABEL[invoice.status] ?? invoice.status, 400, 72, {
        align: "right",
        width: 145,
      });

    doc.moveDown(2.5);

    // Bill-to box
    const billY = doc.y;
    doc.fontSize(9).fillColor("#666").text("Facturé à", 50, billY);
    doc
      .fontSize(12)
      .fillColor("#000")
      .text(company.legalName || company.companyName, 50, billY + 14);
    if (company.headquarters) {
      doc.fontSize(10).fillColor("#444").text(company.headquarters, 50, billY + 32);
    }
    if (company.siret) {
      doc.fontSize(9).fillColor("#666").text(`SIRET ${company.siret}`, 50, billY + 48);
    }
    if (company.vatNumber) {
      doc.fontSize(9).fillColor("#666").text(`TVA ${company.vatNumber}`, 50, billY + 60);
    }

    // Dates block
    doc.fontSize(9).fillColor("#666").text("Émise le", 380, billY, { width: 165 });
    doc
      .fontSize(11)
      .fillColor("#000")
      .text(fmtDate(invoice.issueDate), 380, billY + 14, { width: 165 });
    doc.fontSize(9).fillColor("#666").text("Échéance", 380, billY + 36, { width: 165 });
    doc
      .fontSize(11)
      .fillColor("#000")
      .text(fmtDate(invoice.dueDate), 380, billY + 50, { width: 165 });

    doc.y = billY + 90;
    doc.moveDown(1);

    // Lines table
    const tableTop = doc.y + 4;
    const cols = [
      { label: "Description", x: 50, w: 260, align: "left" as const },
      { label: "Qté", x: 310, w: 50, align: "right" as const },
      { label: "PU HT", x: 360, w: 80, align: "right" as const },
      { label: "Total HT", x: 440, w: 105, align: "right" as const },
    ];

    doc.fontSize(9).fillColor("#666");
    for (const c of cols) {
      doc.text(c.label, c.x, tableTop, { width: c.w, align: c.align });
    }
    doc
      .moveTo(50, tableTop + 14)
      .lineTo(545, tableTop + 14)
      .strokeColor("#E5E7EB")
      .stroke();

    let y = tableTop + 22;
    doc.fontSize(10).fillColor("#000");
    for (const l of invoice.lines) {
      if (y > 720) {
        doc.addPage();
        y = 60;
      }
      doc.text(l.label, cols[0].x, y, { width: cols[0].w });
      doc.text(String(l.qty), cols[1].x, y, {
        width: cols[1].w,
        align: cols[1].align,
      });
      doc.text(eur(l.unitCents), cols[2].x, y, {
        width: cols[2].w,
        align: cols[2].align,
      });
      doc.text(eur(l.totalCents), cols[3].x, y, {
        width: cols[3].w,
        align: cols[3].align,
      });
      y += 22;
    }

    // Totals
    y += 10;
    doc
      .moveTo(360, y)
      .lineTo(545, y)
      .strokeColor("#E5E7EB")
      .stroke();
    y += 8;

    const totalsRow = (label: string, value: string, bold = false) => {
      doc
        .fontSize(bold ? 12 : 10)
        .fillColor(bold ? "#0F1B3F" : "#444")
        .text(label, 360, y, { width: 100, align: "right" });
      doc
        .fontSize(bold ? 13 : 10)
        .fillColor("#000")
        .text(value, 460, y, { width: 85, align: "right" });
      y += bold ? 22 : 16;
    };

    totalsRow("Sous-total HT", eur(invoice.subtotalCents));
    totalsRow("TVA", eur(invoice.taxCents));
    totalsRow("Total TTC", eur(invoice.totalCents), true);

    if (invoice.notes) {
      y += 16;
      doc.fontSize(9).fillColor("#666").text("Notes", 50, y);
      y += 12;
      doc.fontSize(10).fillColor("#000").text(invoice.notes, 50, y, { width: 495 });
    }

    if (invoice.status === "payee" && invoice.paidAt) {
      y = Math.max(y, 720);
      doc
        .fontSize(9)
        .fillColor("#16A34A")
        .text(
          `Réglée le ${fmtDate(invoice.paidAt)}${invoice.paidVia ? ` · ${invoice.paidVia}` : ""}${invoice.paidReference ? ` · réf ${invoice.paidReference}` : ""}`,
          50,
          y,
          { width: 495 },
        );
    }

    // Footer
    doc
      .fontSize(8)
      .fillColor("#999")
      .text(
        "Publeader · contact@publeader.com — Toute facture impayée porte intérêt selon le taux légal en vigueur.",
        50,
        790,
        { width: 495, align: "center" },
      );

    doc.end();
  });
}
