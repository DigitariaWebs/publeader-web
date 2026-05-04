"use client";

/**
 * AppShell — root orchestrator for authenticated pages.
 * Picks between the glass (rond/vitré) layout and the pro (navy classique)
 * layout based on the current `uiStyle` from ThemeContext, and mounts the
 * shared overlays (command palette, notifications, toasts).
 */

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { GlassShell } from "@/components/GlassShell";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsSheet } from "@/components/NotificationsSheet";
import { Toaster } from "@/components/Toaster";
import { useTheme } from "@/contexts/ThemeContext";
import { breadcrumbForPath, titleForPath } from "@/lib/nav";
import { authClient } from "@/lib/auth-client";

interface AppShellProps {
  children: ReactNode;
  /**
   * Optional override for the page title shown in the pro topbar. When the
   * title depends on dynamic data (e.g. a campaign name), the page can pass
   * it in; otherwise we derive it from the pathname.
   */
  pageTitle?: string;
  /**
   * Optional override for the breadcrumb. When omitted we derive it from the
   * pathname using `breadcrumbForPath`.
   */
  campaignName?: string;
}

export function AppShell({ children, pageTitle, campaignName }: AppShellProps) {
  const { uiStyle } = useTheme();
  const pathname = usePathname() || "/";
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

  // Avoid hydration mismatch: wait for ThemeContext's localStorage read.
  if (!mounted) {
    return null;
  }

  const title = pageTitle || titleForPath(pathname, campaignName);
  const breadcrumb = breadcrumbForPath(pathname, campaignName);

  const overlays = (
    <>
      <CommandPalette />
      <NotificationsSheet />
      <Toaster />
    </>
  );

  if (uiStyle === "glass") {
    return (
      <>
        <GlassShell>{children}</GlassShell>
        {overlays}
      </>
    );
  }

  // Pro UI — classic navy sidebar + topbar layout.
  return (
    <>
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <Topbar title={title} breadcrumb={breadcrumb} />
          <main className="app-content">{children}</main>
        </div>
      </div>
      {overlays}
    </>
  );
}
