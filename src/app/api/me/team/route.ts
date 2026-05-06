import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import { getTeamSnapshot, TeamServiceError } from "@/lib/team-service";

export async function GET(req: NextRequest) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  try {
    const snapshot = await getTeamSnapshot({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      currentUserId: auth.user.id,
    });
    return NextResponse.json(snapshot);
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: e.code === "not_found" ? 404 : 400 },
      );
    }
    console.error("[GET /api/me/team]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
