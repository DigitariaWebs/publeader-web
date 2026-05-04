import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  organizationClient,
  emailOTPClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  plugins: [adminClient(), organizationClient(), emailOTPClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  emailOtp,
  organization,
  admin,
} = authClient;
