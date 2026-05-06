import { NextRequest, NextResponse } from "next/server";
import { requireAdvertiser } from "@/lib/session";
import { inviteMember, TeamServiceError } from "@/lib/team-service";

const STATUS_BY_CODE: Record<string, number> = {
  invalid_email: 400,
  invalid_role: 400,
  already_member: 409,
  already_invited: 409,
  not_found: 404,
  forbidden: 403,
};

export async function POST(req: NextRequest) {
  const auth = await requireAdvertiser(req.headers);
  if (!auth.ok) return auth.response;
  if (!auth.company._id) {
    return NextResponse.json({ error: "company missing" }, { status: 409 });
  }
  let body: { email?: string; role?: string };
  try {
    body = (await req.json()) as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const inv = await inviteMember({
      headers: req.headers,
      companyId: auth.company._id.toString(),
      requesterUserId: auth.user.id,
      email: String(body.email ?? ""),
      role: String(body.role ?? ""),
    });
    return NextResponse.json({ invitation: inv });
  } catch (e) {
    if (e instanceof TeamServiceError) {
      return NextResponse.json(
        { error: e.code, message: e.message },
        { status: STATUS_BY_CODE[e.code] ?? 400 },
      );
    }
    console.error("[POST /api/me/team/invite]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
