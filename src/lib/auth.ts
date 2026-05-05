import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, organization, emailOTP } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { db, mongoClient } from "./db";
import { sendMail } from "./mailer";

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
