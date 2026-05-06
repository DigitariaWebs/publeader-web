"use client";

/**
 * EnterpriseEquipe — advertiser's team & access management.
 *
 * Reads from /api/me/team and mutates through the matching invite/member
 * endpoints. All admin-only actions (invite, role change, remove, cancel
 * invite, resend) are gated server-side; the UI hides them for non-admin
 * viewers as a UX nicety, not a security boundary.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type Role = "admin" | "editor" | "viewer";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  editor: "Éditeur",
  viewer: "Lecteur",
};

const ROLE_TONE: Record<Role, string> = {
  admin: "info",
  editor: "paid",
  viewer: "draft",
};

type Member = {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  lastSeenAt?: string;
  isSelf: boolean;
};

type Invitation = {
  invitationId: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  createdAt: string;
  inviterId: string;
};

type Snapshot = { members: Member[]; invitations: Invitation[] };

const ERROR_LABEL: Record<string, string> = {
  invalid_email: "E-mail invalide.",
  invalid_role: "Rôle invalide.",
  already_member: "Cette personne est déjà membre.",
  already_invited: "Une invitation est déjà en attente pour cet e-mail.",
  not_found: "Élément introuvable.",
  forbidden: "Action réservée aux admins.",
  cannot_modify_self: "Vous ne pouvez pas modifier votre propre rôle.",
  last_admin: "Au moins un admin doit rester dans l'équipe.",
};

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "à l'instant";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `il y a ${weeks} sem.`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

function avatarFor(member: Member): string {
  if (member.name?.trim()) {
    const parts = member.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return (member.email[0] ?? "?").toUpperCase();
}

export function EnterpriseEquipe() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/me/team", { cache: "no-store" });
      const body = (await res.json()) as Snapshot & { error?: string; message?: string };
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Erreur de chargement");
        return;
      }
      setSnapshot({ members: body.members, invitations: body.invitations });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const me = useMemo(
    () => snapshot?.members.find((m) => m.isSelf),
    [snapshot],
  );
  const isAdmin = me?.role === "admin";

  const adminCount = useMemo(
    () => (snapshot?.members ?? []).filter((m) => m.role === "admin").length,
    [snapshot],
  );

  async function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteSending) return;
    setInviteSending(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/me/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setInviteError(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
        return;
      }
      setInviteEmail("");
      setInviteRole("editor");
      setInviteOpen(false);
      await reload();
    } finally {
      setInviteSending(false);
    }
  }

  async function cancelInvite(invitationId: string) {
    if (!confirm("Annuler cette invitation ?")) return;
    setBusyId(invitationId);
    try {
      const res = await fetch(`/api/me/team/invitations/${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(ERROR_LABEL[body.error ?? ""] ?? "Erreur");
        return;
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvite(invitationId: string) {
    setBusyId(invitationId);
    try {
      const res = await fetch(`/api/me/team/invitations/${invitationId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(ERROR_LABEL[body.error ?? ""] ?? "Erreur");
        return;
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(memberId: string, role: Role) {
    setBusyId(memberId);
    setOpenMenuId(null);
    try {
      const res = await fetch(`/api/me/team/members/${memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(ERROR_LABEL[body.error ?? ""] ?? "Erreur");
        return;
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Retirer ce membre de l'équipe ?")) return;
    setBusyId(memberId);
    setOpenMenuId(null);
    try {
      const res = await fetch(`/api/me/team/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(ERROR_LABEL[body.error ?? ""] ?? "Erreur");
        return;
      }
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !snapshot) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
              Équipe
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              Chargement…
            </p>
          </div>
        </div>
      </div>
    );
  }

  const members = snapshot?.members ?? [];
  const invites = snapshot?.invitations ?? [];

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Équipe
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            {members.length} {members.length > 1 ? "membres" : "membre"} ·{" "}
            {invites.length} {invites.length > 1 ? "invitations en attente" : "invitation en attente"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {isAdmin && (
            <button
              type="button"
              className="glass-btn"
              onClick={() => setInviteOpen((v) => !v)}
            >
              <Icon name="user-plus" size={14} /> Inviter
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "rgba(239,68,68,0.08)",
            color: "#b91c1c",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {inviteOpen && isAdmin && (
        <form onSubmit={submitInvite} className="glass-panel" style={{ marginBottom: 20 }}>
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>Nouvelle invitation</h3>
          </div>
          <div
            style={{
              padding: 16,
              display: "grid",
              gridTemplateColumns: "1fr 1fr auto auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <div>
              <div style={fieldLabelStyle}>Email</div>
              <input
                className="glass-input"
                type="email"
                required
                placeholder="prenom.nom@entreprise.fr"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviteSending}
              />
            </div>
            <div>
              <div style={fieldLabelStyle}>Rôle</div>
              <select
                className="glass-input"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                disabled={inviteSending}
              >
                <option value="admin">Admin</option>
                <option value="editor">Éditeur</option>
                <option value="viewer">Lecteur</option>
              </select>
            </div>
            <button
              type="button"
              className="glass-btn ghost"
              onClick={() => setInviteOpen(false)}
              disabled={inviteSending}
            >
              Annuler
            </button>
            <button type="submit" className="glass-btn" disabled={inviteSending}>
              <Icon name="mail" size={14} /> {inviteSending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
          {inviteError && (
            <div
              style={{
                padding: "8px 16px 16px",
                color: "#b91c1c",
                fontSize: 12,
              }}
            >
              {inviteError}
            </div>
          )}
        </form>
      )}

      <div className="glass-kpigrid">
        {(
          [
            { l: "Admins", v: members.filter((m) => m.role === "admin").length, s: "accès complet" },
            { l: "Éditeurs", v: members.filter((m) => m.role === "editor").length, s: "campagnes & assets" },
            { l: "Lecteurs", v: members.filter((m) => m.role === "viewer").length, s: "consultation seule" },
            { l: "Invitations", v: invites.length, s: "en attente" },
          ] as const
        ).map((k) => (
          <div key={k.l} className="glass-kpi">
            <div style={kpiLabelStyle}>{k.l}</div>
            <div style={kpiValueStyle}>{k.v}</div>
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ marginTop: 24 }}>
        <div className="glass-panelhead">
          <h3 style={{ margin: 0, fontSize: 14 }}>Membres actifs</h3>
        </div>
        <table className="glass-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Dernière activité</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const canModify = isAdmin && !m.isSelf;
              const cannotDemoteLastAdmin =
                m.role === "admin" && adminCount <= 1;
              return (
                <tr key={m.memberId}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={avatarStyle}>{avatarFor(m)}</div>
                      <span style={{ fontWeight: 600 }}>
                        {m.name || "—"} {m.isSelf && <span style={{ color: "var(--gray-500)", fontWeight: 400 }}>(vous)</span>}
                      </span>
                    </div>
                  </td>
                  <td style={{ color: "var(--gray-500)" }}>{m.email}</td>
                  <td>
                    <span className={`ent-chip ${ROLE_TONE[m.role]}`}>
                      {ROLE_LABEL[m.role]}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {relativeTime(m.lastSeenAt)}
                  </td>
                  <td style={{ textAlign: "right", position: "relative" }}>
                    {canModify ? (
                      <>
                        <button
                          type="button"
                          className="glass-btn ghost"
                          style={{ padding: "4px 10px" }}
                          disabled={busyId === m.memberId}
                          onClick={() =>
                            setOpenMenuId((v) => (v === m.memberId ? null : m.memberId))
                          }
                        >
                          <Icon name="more-horizontal" size={14} />
                        </button>
                        {openMenuId === m.memberId && (
                          <div style={menuStyle}>
                            {(["admin", "editor", "viewer"] as Role[]).map((r) => {
                              const isCurrent = m.role === r;
                              const wouldRemoveLastAdmin =
                                r !== "admin" && cannotDemoteLastAdmin;
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  style={{
                                    ...menuItemStyle,
                                    opacity: isCurrent || wouldRemoveLastAdmin ? 0.4 : 1,
                                    cursor:
                                      isCurrent || wouldRemoveLastAdmin
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                  disabled={isCurrent || wouldRemoveLastAdmin}
                                  onClick={() => changeRole(m.memberId, r)}
                                >
                                  {isCurrent ? "✓ " : ""}
                                  {ROLE_LABEL[r]}
                                </button>
                              );
                            })}
                            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "6px 0" }} />
                            <button
                              type="button"
                              style={{
                                ...menuItemStyle,
                                color: "#b91c1c",
                                opacity: cannotDemoteLastAdmin ? 0.4 : 1,
                                cursor: cannotDemoteLastAdmin ? "not-allowed" : "pointer",
                              }}
                              disabled={cannotDemoteLastAdmin}
                              onClick={() => removeMember(m.memberId)}
                            >
                              Retirer du compte
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--gray-400)", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && (
        <div className="glass-panel" style={{ marginTop: 24 }}>
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>Invitations en attente</h3>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 10 }}>
            {invites.map((i) => (
              <div
                key={i.invitationId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 14px",
                  background: "rgba(255,255,255,0.6)",
                  border: "1px dashed rgba(35,52,102,0.2)",
                  borderRadius: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={inviteIconStyle}>
                    <Icon name="mail" size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{i.email}</div>
                    <div style={{ fontSize: 11.5, color: "var(--gray-500)" }}>
                      {ROLE_LABEL[i.role]} · envoyé {relativeTime(i.createdAt)}
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="glass-btn ghost"
                      style={{ padding: "4px 10px" }}
                      disabled={busyId === i.invitationId}
                      onClick={() => resendInvite(i.invitationId)}
                    >
                      Renvoyer
                    </button>
                    <button
                      type="button"
                      className="glass-btn ghost"
                      style={{ padding: "4px 10px", color: "#B91C1C" }}
                      disabled={busyId === i.invitationId}
                      onClick={() => cancelInvite(i.invitationId)}
                    >
                      <Icon name="x" size={12} /> Annuler
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--gray-500)",
  marginBottom: 4,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--gray-500)",
};

const kpiValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 28,
  fontWeight: 700,
  margin: "4px 0",
};

const avatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #EC407A, #A855F7)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 11,
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 10,
  padding: 6,
  minWidth: 180,
  boxShadow: "0 12px 28px rgba(15,23,42,0.12)",
  zIndex: 10,
  textAlign: "left",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  background: "transparent",
  border: 0,
  fontSize: 13,
  textAlign: "left",
  borderRadius: 8,
  color: "#0f172a",
};

const inviteIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "rgba(35,52,102,0.08)",
  color: "var(--gray-500)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
