import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/schemas";
import {
  ExpenseError,
  createExpense,
  listExpenses,
} from "@/lib/expense-service";
import { serializeExpense } from "@/lib/finance-serializer";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_label: 400,
  invalid_amount: 400,
  invalid_category: 400,
  invalid_date: 400,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const cat = url.searchParams.get("category");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const category =
    cat && EXPENSE_CATEGORIES.includes(cat as ExpenseCategory)
      ? (cat as ExpenseCategory)
      : undefined;

  const expenses = await listExpenses({
    category,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  return NextResponse.json({ expenses: expenses.map(serializeExpense) });
}

type PostBody = {
  label: string;
  category: ExpenseCategory;
  amountCents: number;
  vendor?: string;
  expenseDate: string;
  notes?: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const expense = await createExpense(auth.user.id, {
      label: body.label,
      category: body.category,
      amountCents: body.amountCents,
      vendor: body.vendor,
      expenseDate: new Date(body.expenseDate),
      notes: body.notes,
    });
    return NextResponse.json(
      { expense: serializeExpense(expense) },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof ExpenseError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
