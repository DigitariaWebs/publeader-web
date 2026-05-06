import { ObjectId } from "mongodb";
import { auth, ORG_ROLE_NAMES, type OrgRoleName } from "./auth";
import { db } from "./db";
import type { CompanyDoc } from "./schemas";
import { Collections } from "./schemas";

export type TeamErrorCode =
  | "invalid_email"
  | "invalid_role"
  | "already_member"
  | "already_invited"
  | "not_found"
  | "last_admin"
  | "cannot_modify_self"
  | "forbidden"
  | "unknown";

export class TeamServiceError extends Error {
  code: TeamErrorCode;
  meta?: Record<string, unknown>;
  constructor(code: TeamErrorCode, message?: string, meta?: Record<string, unknown>) {
    super(message ?? code);
    this.code = code;
    this.meta = meta;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidRole(value: unknown): value is OrgRoleName {
  return typeof value === "string" && (ORG_ROLE_NAMES as string[]).includes(value);
}

export type TeamMemberDTO = {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: OrgRoleName;
  createdAt: string;
  lastSeenAt?: string;
  isSelf: boolean;
};

export type TeamInvitationDTO = {
  invitationId: string;
  email: string;
  role: OrgRoleName;
  status: string;
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

export type TeamSnapshot = {
  members: TeamMemberDTO[];
  invitations: TeamInvitationDTO[];
};

type RawMember = {
  id: string;
  userId: string;
  role: string;
  createdAt: Date | string;
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
};

type RawInvitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | string;
  createdAt?: Date | string;
  inviterId: string;
  organizationId: string;
};

function normalizeRole(role: string): OrgRoleName {
  // Better Auth may return comma-separated multi-roles; we always use a single role.
  const first = role.split(",")[0].trim();
  return isValidRole(first) ? first : "viewer";
}

async function findCompanyById(companyId: string): Promise<CompanyDoc | null> {
  return (await db
    .collection(Collections.companies)
    .findOne({ _id: new ObjectId(companyId) })) as CompanyDoc | null;
}

async function ensureOrganizationId(companyId: string): Promise<string> {
  const company = await findCompanyById(companyId);
  if (!company) throw new TeamServiceError("not_found", "company not found");
  if (!company.organizationId) {
    throw new TeamServiceError("not_found", "company has no organization");
  }
  return company.organizationId;
}

async function loadLastSeenMap(userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const sessions = (await db
    .collection("session")
    .find({ userId: { $in: userIds } })
    .project({ userId: 1, updatedAt: 1 })
    .toArray()) as { userId: string; updatedAt?: Date }[];
  const map = new Map<string, Date>();
  for (const s of sessions) {
    if (!s.updatedAt) continue;
    const prev = map.get(s.userId);
    if (!prev || s.updatedAt > prev) map.set(s.userId, s.updatedAt);
  }
  return map;
}

function memberIsAdmin(role: string): boolean {
  return normalizeRole(role) === "admin";
}

async function fetchMembersRaw(headers: Headers, organizationId: string): Promise<RawMember[]> {
  const res = (await auth.api.listMembers({
    headers,
    query: { organizationId, limit: 200 } as never,
  })) as { members?: RawMember[] } | RawMember[];
  if (Array.isArray(res)) return res;
  return res.members ?? [];
}

async function fetchInvitationsRaw(
  headers: Headers,
  organizationId: string,
): Promise<RawInvitation[]> {
  const res = (await auth.api.listInvitations({
    headers,
    query: { organizationId } as never,
  })) as RawInvitation[];
  return Array.isArray(res) ? res : [];
}

async function countAdmins(headers: Headers, organizationId: string): Promise<number> {
  const members = await fetchMembersRaw(headers, organizationId);
  return members.filter((m) => memberIsAdmin(m.role)).length;
}

export async function getTeamSnapshot(params: {
  headers: Headers;
  companyId: string;
  currentUserId: string;
}): Promise<TeamSnapshot> {
  const orgId = await ensureOrganizationId(params.companyId);
  const [rawMembers, rawInvites] = await Promise.all([
    fetchMembersRaw(params.headers, orgId),
    fetchInvitationsRaw(params.headers, orgId),
  ]);
  const lastSeenMap = await loadLastSeenMap(rawMembers.map((m) => m.userId));
  const members: TeamMemberDTO[] = rawMembers.map((m) => ({
    memberId: m.id,
    userId: m.userId,
    email: m.user?.email ?? "",
    name: m.user?.name ?? "",
    role: normalizeRole(m.role),
    createdAt: new Date(m.createdAt).toISOString(),
    lastSeenAt: lastSeenMap.get(m.userId)?.toISOString(),
    isSelf: m.userId === params.currentUserId,
  }));
  const pending = rawInvites.filter((i) => i.status === "pending");
  const invitations: TeamInvitationDTO[] = pending.map((i) => ({
    invitationId: i.id,
    email: i.email,
    role: normalizeRole(i.role),
    status: i.status,
    expiresAt: new Date(i.expiresAt).toISOString(),
    createdAt: new Date(i.createdAt ?? i.expiresAt).toISOString(),
    inviterId: i.inviterId,
  }));
  return { members, invitations };
}

async function ensureRequesterIsAdmin(
  headers: Headers,
  organizationId: string,
  requesterUserId: string,
): Promise<void> {
  const members = await fetchMembersRaw(headers, organizationId);
  const me = members.find((m) => m.userId === requesterUserId);
  if (!me || !memberIsAdmin(me.role)) {
    throw new TeamServiceError("forbidden", "admin role required");
  }
}

export async function inviteMember(params: {
  headers: Headers;
  companyId: string;
  requesterUserId: string;
  email: string;
  role: string;
}): Promise<TeamInvitationDTO> {
  const email = params.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new TeamServiceError("invalid_email");
  }
  if (!isValidRole(params.role)) {
    throw new TeamServiceError("invalid_role");
  }
  const orgId = await ensureOrganizationId(params.companyId);
  await ensureRequesterIsAdmin(params.headers, orgId, params.requesterUserId);

  const [members, invites] = await Promise.all([
    fetchMembersRaw(params.headers, orgId),
    fetchInvitationsRaw(params.headers, orgId),
  ]);
  if (members.some((m) => m.user?.email?.toLowerCase() === email)) {
    throw new TeamServiceError("already_member");
  }
  if (invites.some((i) => i.email.toLowerCase() === email && i.status === "pending")) {
    throw new TeamServiceError("already_invited");
  }

  try {
    const created = (await auth.api.createInvitation({
      headers: params.headers,
      body: {
        email,
        role: params.role,
        organizationId: orgId,
      },
    })) as RawInvitation;
    return {
      invitationId: created.id,
      email: created.email,
      role: normalizeRole(created.role),
      status: created.status,
      expiresAt: new Date(created.expiresAt).toISOString(),
      createdAt: new Date(created.createdAt ?? created.expiresAt).toISOString(),
      inviterId: created.inviterId,
    };
  } catch (e) {
    throw new TeamServiceError("unknown", (e as Error).message);
  }
}

export async function cancelInvitation(params: {
  headers: Headers;
  companyId: string;
  requesterUserId: string;
  invitationId: string;
}): Promise<void> {
  const orgId = await ensureOrganizationId(params.companyId);
  await ensureRequesterIsAdmin(params.headers, orgId, params.requesterUserId);
  try {
    await auth.api.cancelInvitation({
      headers: params.headers,
      body: { invitationId: params.invitationId },
    });
  } catch (e) {
    throw new TeamServiceError("not_found", (e as Error).message);
  }
}

export async function resendInvitation(params: {
  headers: Headers;
  companyId: string;
  requesterUserId: string;
  invitationId: string;
}): Promise<TeamInvitationDTO> {
  const orgId = await ensureOrganizationId(params.companyId);
  await ensureRequesterIsAdmin(params.headers, orgId, params.requesterUserId);

  // Look up the original invite so we can reuse its email + role.
  const invites = await fetchInvitationsRaw(params.headers, orgId);
  const invite = invites.find((i) => i.id === params.invitationId);
  if (!invite) throw new TeamServiceError("not_found");

  // cancelPendingInvitationsOnReInvite is enabled, so a fresh invite supersedes
  // the previous one (and triggers a new email).
  return inviteMember({
    headers: params.headers,
    companyId: params.companyId,
    requesterUserId: params.requesterUserId,
    email: invite.email,
    role: invite.role,
  });
}

export async function removeMember(params: {
  headers: Headers;
  companyId: string;
  requesterUserId: string;
  memberId: string;
}): Promise<void> {
  const orgId = await ensureOrganizationId(params.companyId);
  await ensureRequesterIsAdmin(params.headers, orgId, params.requesterUserId);

  const members = await fetchMembersRaw(params.headers, orgId);
  const target = members.find((m) => m.id === params.memberId);
  if (!target) throw new TeamServiceError("not_found");
  if (target.userId === params.requesterUserId) {
    throw new TeamServiceError("cannot_modify_self");
  }
  if (memberIsAdmin(target.role)) {
    const adminCount = members.filter((m) => memberIsAdmin(m.role)).length;
    if (adminCount <= 1) throw new TeamServiceError("last_admin");
  }

  try {
    await auth.api.removeMember({
      headers: params.headers,
      body: { memberIdOrEmail: target.id, organizationId: orgId },
    });
  } catch (e) {
    throw new TeamServiceError("unknown", (e as Error).message);
  }

  // Best-effort: clear companyId on the removed user so they no longer pass
  // requireAdvertiser checks for this company.
  try {
    await db.collection("user").updateOne(
      { _id: target.userId } as never,
      { $unset: { companyId: "" } },
    );
  } catch (e) {
    console.warn("[team-service] failed to clear companyId on remove", e);
  }
}

export async function updateMemberRole(params: {
  headers: Headers;
  companyId: string;
  requesterUserId: string;
  memberId: string;
  role: string;
}): Promise<void> {
  if (!isValidRole(params.role)) throw new TeamServiceError("invalid_role");
  const orgId = await ensureOrganizationId(params.companyId);
  await ensureRequesterIsAdmin(params.headers, orgId, params.requesterUserId);

  const members = await fetchMembersRaw(params.headers, orgId);
  const target = members.find((m) => m.id === params.memberId);
  if (!target) throw new TeamServiceError("not_found");
  if (target.userId === params.requesterUserId) {
    throw new TeamServiceError("cannot_modify_self");
  }
  // If demoting an admin, ensure another admin remains.
  if (memberIsAdmin(target.role) && params.role !== "admin") {
    const adminCount = members.filter((m) => memberIsAdmin(m.role)).length;
    if (adminCount <= 1) throw new TeamServiceError("last_admin");
  }

  try {
    await auth.api.updateMemberRole({
      headers: params.headers,
      body: {
        memberId: target.id,
        role: params.role,
        organizationId: orgId,
      },
    });
  } catch (e) {
    throw new TeamServiceError("unknown", (e as Error).message);
  }
}

export async function acceptInvitationAndLink(params: {
  headers: Headers;
  invitationId: string;
}): Promise<{ organizationId: string; role: OrgRoleName; companyId: string }> {
  const result = (await auth.api.acceptInvitation({
    headers: params.headers,
    body: { invitationId: params.invitationId },
  })) as
    | {
        invitation?: { organizationId?: string; email?: string };
        member?: { role?: string; userId?: string; organizationId?: string };
      }
    | null;
  if (!result || !result.invitation || !result.member) {
    throw new TeamServiceError("not_found", "invitation could not be accepted");
  }
  const orgId = result.member.organizationId ?? result.invitation.organizationId;
  if (!orgId) throw new TeamServiceError("not_found");
  const company = (await db
    .collection(Collections.companies)
    .findOne({ organizationId: orgId })) as CompanyDoc | null;
  if (!company || !company._id) throw new TeamServiceError("not_found");
  const companyId = company._id.toString();
  const userId = result.member.userId;
  if (userId) {
    await db.collection("user").updateOne(
      { _id: userId } as never,
      {
        $set: {
          companyId,
          role: "team_member",
        },
      },
    );
  }
  return {
    organizationId: orgId,
    role: normalizeRole(result.member.role ?? "viewer"),
    companyId,
  };
}
