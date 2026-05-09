import { db } from "./db";
import {
  Collections,
  type ExpenseDoc,
  type InvoiceDoc,
  type TransactionDoc,
} from "./schemas";
import { effectiveTier } from "./wallet";

export type FinanceKpiDTO = {
  // Recurring revenue: sum of invoices PAID this calendar month.
  mrrCents: number;
  // Same as mrr but with explicit naming for the "Encaissé (mois)" KPI.
  collectedCents: number;
  collectedCount: number;
  // Sum of issued-but-unpaid invoices (envoyee + en_retard).
  pendingCents: number;
  pendingCount: number;
  overdueCents: number;
  overdueCount: number;
  // Driver commissions still in pending tier (not yet settled).
  commissionsDueCents: number;
  commissionsDueCount: number;
  // Operational expenses this month.
  expensesMonthCents: number;
  expensesMonthCount: number;
  // ISO date markers
  monthStart: string;
  monthEnd: string;
  generatedAt: string;
};

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1,
  );
}

export async function getFinanceKpis(now: Date = new Date()): Promise<FinanceKpiDTO> {
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [paidThisMonth, openInvoices, pendingTxs, monthExpenses] =
    await Promise.all([
      db
        .collection(Collections.invoices)
        .find({
          status: "payee",
          paidAt: { $gte: monthStart, $lte: monthEnd },
        })
        .toArray() as Promise<InvoiceDoc[]>,
      db
        .collection(Collections.invoices)
        .find({ status: "envoyee" })
        .toArray() as Promise<InvoiceDoc[]>,
      db
        .collection(Collections.transactions)
        .find({ type: "campaign_completion", tier: "pending" })
        .toArray() as Promise<TransactionDoc[]>,
      db
        .collection(Collections.expenses)
        .find({ expenseDate: { $gte: monthStart, $lte: monthEnd } })
        .toArray() as Promise<ExpenseDoc[]>,
    ]);

  const collectedCents = paidThisMonth.reduce(
    (a, b) => a + b.totalCents,
    0,
  );

  let pendingCents = 0;
  let overdueCents = 0;
  let overdueCount = 0;
  for (const inv of openInvoices) {
    pendingCents += inv.totalCents;
    if (inv.dueDate && inv.dueDate < now) {
      overdueCents += inv.totalCents;
      overdueCount++;
    }
  }

  let commissionsDueCents = 0;
  let commissionsDueCount = 0;
  for (const t of pendingTxs) {
    if (effectiveTier(t, now) === "pending") {
      commissionsDueCents += t.amountCents;
      commissionsDueCount++;
    }
  }

  const expensesMonthCents = monthExpenses.reduce(
    (a, b) => a + b.amountCents,
    0,
  );

  return {
    mrrCents: collectedCents,
    collectedCents,
    collectedCount: paidThisMonth.length,
    pendingCents,
    pendingCount: openInvoices.length,
    overdueCents,
    overdueCount,
    commissionsDueCents,
    commissionsDueCount,
    expensesMonthCents,
    expensesMonthCount: monthExpenses.length,
    monthStart: monthStart.toISOString(),
    monthEnd: monthEnd.toISOString(),
    generatedAt: now.toISOString(),
  };
}
