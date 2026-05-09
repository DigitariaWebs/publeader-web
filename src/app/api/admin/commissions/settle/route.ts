import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { settleCommissions } from "@/lib/commission-service";

type PostBody = {
  transactionIds: string[];
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
  if (!Array.isArray(body.transactionIds) || body.transactionIds.length === 0) {
    return NextResponse.json(
      { error: "invalid_body", message: "transactionIds[] required" },
      { status: 400 },
    );
  }
  const result = await settleCommissions(body.transactionIds);
  return NextResponse.json(result);
}
