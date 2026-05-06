import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { CompanyDoc } from "@/lib/schemas";
import { Collections } from "@/lib/schemas";
import { InviteAcceptForm } from "@/components/InviteAcceptForm";

type PageProps = { params: Promise<{ id: string }> };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  editor: "Éditeur",
  viewer: "Lecteur",
};

export default async function InviteAcceptPage({ params }: PageProps) {
  const { id } = await params;
  const reqHeaders = await headers();

  type InvitationView = {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date | string;
    organizationId: string;
    organizationName?: string;
  };

  // Look up the invitation server-side. If anything fails the user gets a
  // generic error UI rather than a stack trace.
  let invitation: InvitationView | null = null;
  try {
    const raw = (await auth.api.getInvitation({
      headers: reqHeaders,
      query: { id } as never,
    })) as unknown;
    invitation = raw ? (raw as InvitationView) : null;
  } catch {
    invitation = null;
  }

  if (!invitation) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invitation introuvable</h1>
          <p style={textStyle}>
            Le lien que vous avez ouvert n&apos;est plus valide ou a été annulé.
            Demandez à un administrateur de vous renvoyer une invitation.
          </p>
          <a href="/login" style={primaryBtnStyle}>
            Connexion
          </a>
        </div>
      </div>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invitation déjà traitée</h1>
          <p style={textStyle}>
            Cette invitation a déjà été {invitation.status === "accepted" ? "acceptée" : "annulée"}.
          </p>
          <a href="/enterprise" style={primaryBtnStyle}>
            Accéder au dashboard
          </a>
        </div>
      </div>
    );
  }

  const expiresAt = new Date(invitation.expiresAt);
  if (expiresAt.getTime() < Date.now()) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invitation expirée</h1>
          <p style={textStyle}>
            Ce lien d&apos;invitation a expiré. Demandez un nouvel envoi à votre
            administrateur.
          </p>
        </div>
      </div>
    );
  }

  let organizationName = invitation.organizationName;
  if (!organizationName) {
    const company = (await db
      .collection(Collections.companies)
      .findOne({ organizationId: invitation.organizationId })) as CompanyDoc | null;
    organizationName = company?.companyName ?? "votre entreprise";
  }

  // Resolve the current session (if any) to decide which UI variant to show.
  const session = await auth.api.getSession({ headers: reqHeaders });
  const currentEmail = session?.user?.email?.toLowerCase();
  const inviteEmail = invitation.email.toLowerCase();
  const roleLabel = ROLE_LABEL[invitation.role] ?? invitation.role;

  if (!session) {
    const nextHref = `/invite/${invitation.id}`;
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Invitation à rejoindre {organizationName}</h1>
          <p style={textStyle}>
            Vous avez été invité(e) en tant que <strong>{roleLabel}</strong> à
            l&apos;adresse <strong>{invitation.email}</strong>.
          </p>
          <p style={textStyle}>
            Connectez-vous pour accepter l&apos;invitation. Si vous n&apos;avez
            pas encore de compte, créez-en un d&apos;abord avec cette même
            adresse e-mail.
          </p>
          <a href={`/login?next=${encodeURIComponent(nextHref)}`} style={primaryBtnStyle}>
            Se connecter
          </a>
        </div>
      </div>
    );
  }

  if (currentEmail !== inviteEmail) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Mauvais compte connecté</h1>
          <p style={textStyle}>
            Cette invitation est destinée à <strong>{invitation.email}</strong>.
            Vous êtes connecté(e) en tant que <strong>{session.user.email}</strong>.
          </p>
          <p style={textStyle}>
            Déconnectez-vous puis réessayez avec le bon compte.
          </p>
          <a href="/logout" style={primaryBtnStyle}>
            Se déconnecter
          </a>
        </div>
      </div>
    );
  }

  // Same email — show client-side form to accept.
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Rejoindre {organizationName}</h1>
        <p style={textStyle}>
          Vous êtes invité(e) en tant que <strong>{roleLabel}</strong>.
        </p>
        <InviteAcceptForm invitationId={invitation.id} />
      </div>
    </div>
  );
}

// Avoid crashing the redirect import; not used but reserved for future flows.
void redirect;

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 480,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.06)",
  borderRadius: 16,
  padding: 32,
  boxShadow: "0 12px 32px rgba(15,23,42,0.08)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 12px",
  color: "#0f172a",
};

const textStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#475569",
  margin: "0 0 12px",
};

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "10px 18px",
  background: "#0f172a",
  color: "#fff",
  borderRadius: 10,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
};
