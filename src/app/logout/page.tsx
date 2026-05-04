"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LogoutPage() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await authClient.signOut();
      router.replace("/login");
    })();
  }, [router]);
  return null;
}
