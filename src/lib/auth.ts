import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, organization, emailOTP } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { expo } from "@better-auth/expo";
import { db, mongoClient } from "./db";
import { sendMail } from "./mailer";

// --- Organization access control (advertiser team roles) ---
//
// Permissions are scoped to advertiser-side resources. Each invited team
// member gets one of three roles whose capabilities are listed below.
const orgStatement = {
  campaign: ["read", "write"],
  asset: ["read", "write"],
  profile: ["read", "write"],
  team: ["read", "write"],
  billing: ["read", "write"],
  performance: ["read"],
} as const;

const orgAc = createAccessControl(orgStatement);

const adminRole = orgAc.newRole({
  campaign: ["read", "write"],
  asset: ["read", "write"],
  profile: ["read", "write"],
  team: ["read", "write"],
  billing: ["read", "write"],
  performance: ["read"],
});

const editorRole = orgAc.newRole({
  campaign: ["read", "write"],
  asset: ["read", "write"],
  performance: ["read"],
});

const viewerRole = orgAc.newRole({
  campaign: ["read"],
  asset: ["read"],
  performance: ["read"],
});

export const ORG_ROLES = {
  admin: adminRole,
  editor: editorRole,
  viewer: viewerRole,
} as const;

export type OrgRoleName = keyof typeof ORG_ROLES;

export const ORG_ROLE_NAMES: OrgRoleName[] = ["admin", "editor", "viewer"];

export const auth = betterAuth({
  database: mongodbAdapter(db, { client: mongoClient }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    "http://localhost:3000",
    "publeader://",
    "exp://",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "driver",
        input: false,
      },
      status: {
        type: "string",
        required: false,
        defaultValue: "pending",
        input: false,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
      driverId: { type: "string", required: false, input: false },
      companyId: { type: "string", required: false, input: false },
      partnerId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    expo(),
    admin({
      defaultRole: "driver",
      adminRoles: ["admin"],
    }),
    organization({
      allowUserToCreateOrganization: false,
      creatorRole: "admin",
      cancelPendingInvitationsOnReInvite: true,
      ac: orgAc,
      roles: ORG_ROLES,
      async sendInvitationEmail({ id, email, role, organization, inviter }) {
        const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
        const link = `${baseUrl}/invite/${id}`;
        const orgName = organization?.name ?? "Publeader";
        const inviterName = inviter?.user?.name ?? inviter?.user?.email ?? "Un administrateur";
        const roleLabel =
          role === "admin"
            ? "Admin"
            : role === "editor"
              ? "Éditeur"
              : "Lecteur";
        await sendMail({
          to: email,
          subject: `Invitation à rejoindre ${orgName} sur Publeader`,
          text:
            `${inviterName} vous invite à rejoindre ${orgName} sur Publeader en tant que ${roleLabel}.\n\n` +
            `Acceptez l'invitation : ${link}\n\n` +
            `Lien valide 48h.`,
        });
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const subjects: Record<string, string> = {
          "sign-in": "Code de connexion Publeader",
          "email-verification": "Vérifiez votre email Publeader",
          "forget-password": "Réinitialisation mot de passe Publeader",
        };
        await sendMail({
          to: email,
          subject: subjects[type] ?? "Code Publeader",
          text: `Votre code: ${otp}\n\nValide 10 minutes.`,
        });
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
