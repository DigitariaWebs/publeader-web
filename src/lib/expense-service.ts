import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseDoc,
} from "./schemas";

export class ExpenseError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "invalid_label"
      | "invalid_amount"
      | "invalid_category"
      | "invalid_date",
    message: string,
  ) {
    super(message);
    this.name = "ExpenseError";
  }
}

export type CreateExpenseInput = {
  label: string;
  category: ExpenseCategory;
  amountCents: number;
  vendor?: string;
  expenseDate: Date;
  notes?: string;
};

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

function validateCategory(c: unknown): ExpenseCategory {
  if (!EXPENSE_CATEGORIES.includes(c as ExpenseCategory)) {
    throw new ExpenseError("invalid_category", "category not allowed");
  }
  return c as ExpenseCategory;
}

function validateAmount(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0)
    throw new ExpenseError("invalid_amount", "amountCents must be > 0");
  return Math.round(v);
}

export async function createExpense(
  adminId: string,
  input: CreateExpenseInput,
): Promise<ExpenseDoc> {
  const label = (input.label ?? "").trim();
  if (!label) throw new ExpenseError("invalid_label", "label required");
  const category = validateCategory(input.category);
  const amountCents = validateAmount(input.amountCents);
  if (!(input.expenseDate instanceof Date) || isNaN(input.expenseDate.getTime()))
    throw new ExpenseError("invalid_date", "expenseDate required");

  const now = new Date();
  const doc: ExpenseDoc = {
    label,
    category,
    amountCents,
    vendor: input.vendor?.trim() || undefined,
    expenseDate: input.expenseDate,
    notes: input.notes?.trim() || undefined,
    createdBy: adminId,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection(Collections.expenses).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listExpenses(filter: {
  category?: ExpenseCategory;
  from?: Date;
  to?: Date;
} = {}): Promise<ExpenseDoc[]> {
  const q: Record<string, unknown> = {};
  if (filter.category) q.category = filter.category;
  if (filter.from || filter.to) {
    const range: Record<string, Date> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.expenseDate = range;
  }
  return (await db
    .collection(Collections.expenses)
    .find(q)
    .sort({ expenseDate: -1, createdAt: -1 })
    .toArray()) as ExpenseDoc[];
}

export async function getExpense(id: string): Promise<ExpenseDoc> {
  if (!ObjectId.isValid(id)) throw new ExpenseError("not_found", "expense not found");
  const doc = (await db
    .collection(Collections.expenses)
    .findOne({ _id: new ObjectId(id) })) as ExpenseDoc | null;
  if (!doc) throw new ExpenseError("not_found", "expense not found");
  return doc;
}

export async function updateExpense(
  id: string,
  patch: UpdateExpenseInput,
): Promise<ExpenseDoc> {
  await getExpense(id);
  const $set: Partial<ExpenseDoc> & { updatedAt: Date } = { updatedAt: new Date() };

  if (patch.label !== undefined) {
    const v = patch.label.trim();
    if (!v) throw new ExpenseError("invalid_label", "label required");
    $set.label = v;
  }
  if (patch.category !== undefined) $set.category = validateCategory(patch.category);
  if (patch.amountCents !== undefined)
    $set.amountCents = validateAmount(patch.amountCents);
  if (patch.vendor !== undefined) $set.vendor = patch.vendor.trim() || undefined;
  if (patch.expenseDate !== undefined) {
    if (!(patch.expenseDate instanceof Date) || isNaN(patch.expenseDate.getTime()))
      throw new ExpenseError("invalid_date", "expenseDate invalid");
    $set.expenseDate = patch.expenseDate;
  }
  if (patch.notes !== undefined) $set.notes = patch.notes.trim() || undefined;

  await db
    .collection(Collections.expenses)
    .updateOne({ _id: new ObjectId(id) }, { $set });

  return getExpense(id);
}

export async function deleteExpense(id: string): Promise<void> {
  await getExpense(id);
  await db
    .collection(Collections.expenses)
    .deleteOne({ _id: new ObjectId(id) });
}
