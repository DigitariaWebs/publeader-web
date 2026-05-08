"use client";

/**
 * Partner portal layout — auth-gated, wrapped in the PartnerShell.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PartnerShell } from "@/components/PartnerShell";
import { authClient } from "@/lib/auth-client";

export default function PartnerLayout({ children }: { children: ReactNode }) {
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

  return <PartnerShell>{children}</PartnerShell>;
}
