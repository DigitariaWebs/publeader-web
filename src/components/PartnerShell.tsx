"use client";

/**
 * PartnerShell — partner-facing portal wrapper.
 * Mirrors EnterpriseShell's glass topbar; tabs reflect P1–P6 todo lanes.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export type PartnerNavId =
  | "dashboard"
  | "terminals"
  | "stock"
  | "ads"
  | "revenue"
  | "notifications"
  | "settings";

interface PartnerShellProps {
  children: ReactNode;
}

interface PillItem {
  id: PartnerNavId;
  label: string;
  href: string;
}

const PILL_NAV: PillItem[] = [
  { id: "dashboard", label: "Accueil", href: "/partenaire" },
  { id: "terminals", label: "Bornes", href: "/partenaire/bornes" },
  { id: "stock", label: "Stock", href: "/partenaire/stock" },
  { id: "ads", label: "Publicités", href: "/partenaire/publicites" },
  { id: "revenue", label: "Revenus", href: "/partenaire/revenus" },
  { id: "notifications", label: "Notifications", href: "/partenaire/notifications" },
];

export function partnerNavIdForPath(pathname: string): PartnerNavId {
  if (pathname === "/partenaire" || pathname === "/partenaire/") return "dashboard";
  if (pathname.startsWith("/partenaire/bornes")) return "terminals";
  if (pathname.startsWith("/partenaire/stock")) return "stock";
  if (pathname.startsWith("/partenaire/publicites")) return "ads";
  if (pathname.startsWith("/partenaire/revenus")) return "revenue";
  if (pathname.startsWith("/partenaire/notifications")) return "notifications";
  if (pathname.startsWith("/partenaire/parametres")) return "settings";
  return "dashboard";
}

export function PartnerShell({ children }: PartnerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const current = partnerNavIdForPath(pathname || "/partenaire");

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function handleSignOut() {
    setMenuOpen(false);
    router.push("/logout");
  }

  return (
    <div className="glass-bg">
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div className="glass-topbar">
          <Link
            href="/partenaire"
            className="glass-logo-img"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <img
              src="/assets/logo-navy.png"
              alt="Publeader"
              style={{ height: 28, width: "auto", display: "block" }}
            />
            <span className="ent-badge">Partenaire</span>
          </Link>

          <div className="glass-pillnav">
            {PILL_NAV.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                className={"p-item" + (current === t.id ? " active" : "")}
              >
                {t.label}
              </Link>
            ))}
          </div>

          <div className="glass-top-right">
            <div className="glass-usermenu" ref={menuRef}>
              <button
                type="button"
                className={"glass-avatar" + (menuOpen ? " open" : "")}
                title="Mon compte"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                P
              </button>
              {menuOpen && (
                <div className="glass-menu" role="menu">
                  <div className="glass-menu-head">
                    <div
                      className="glass-menu-avatar"
                      style={{ background: "linear-gradient(135deg, #F59E0B, #FBBF24)" }}
                    >
                      P
                    </div>
                    <div className="glass-menu-ident">
                      <div className="glass-menu-name">Partenaire</div>
                    </div>
                  </div>
                  <div className="glass-menu-sep" />
                  <Link
                    href="/partenaire/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="user" size={16} />
                    <span>Profil commerce</span>
                  </Link>
                  <Link
                    href="/partenaire/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="settings" size={16} />
                    <span>Paramètres</span>
                  </Link>
                  <div className="glass-menu-sep" />
                  <button
                    type="button"
                    className="glass-menu-item glass-menu-item-danger"
                    role="menuitem"
                    onClick={handleSignOut}
                  >
                    <Icon name="log-out" size={16} />
                    <span>Se déconnecter</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
