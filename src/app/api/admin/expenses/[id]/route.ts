import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  ExpenseError,
  deleteExpense,
  getExpense,
  updateExpense,
} from "@/lib/expense-service";
import { serializeExpense } from "@/lib/finance-serializer";
import type { ExpenseCategory } from "@/lib/schemas";

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  invalid_label: 400,
  invalid_amount: 400,
  invalid_category: 400,
  invalid_date: 400,
};

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const expense = await getExpense(id);
    return NextResponse.json({ expense: serializeExpense(expense) });
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

type PatchBody = {
  label?: string;
  category?: ExpenseCategory;
  amountCents?: number;
  vendor?: string;
  expenseDate?: string;
  notes?: string;
};

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const expense = await updateExpense(id, {
      label: body.label,
      category: body.category,
      amountCents: body.amountCents,
      vendor: body.vendor,
      expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
      notes: body.notes,
    });
    return NextResponse.json({ expense: serializeExpense(expense) });
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

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
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
