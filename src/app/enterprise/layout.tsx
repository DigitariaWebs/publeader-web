"use client";

/**
 * Enterprise portal layout — auth-gated, wrapped in the EnterpriseShell.
 * Separate from AppShell so the advertiser side can evolve independently.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import { authClient } from "@/lib/auth-client";

export default function EnterpriseLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  if (!mounted) return null;

  return <EnterpriseShell>{children}</EnterpriseShell>;
}
