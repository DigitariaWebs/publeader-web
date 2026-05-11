"use client";

/**
 * EnterpriseShell — the advertiser-facing portal wrapper.
 * Same glass morphism design as GlassShell, but with nav + identity
 * tailored to a client account (brand) rather than the agency admin.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

export type EnterpriseNavId =
  | "dashboard"
  | "campaigns"
  | "performance"
  | "billing"
  | "team"
  | "assets"
  | "support"
  | "settings";

interface EnterpriseShellProps {
  children: ReactNode;
}

interface PillItem {
  id: EnterpriseNavId;
  label: string;
  href: string;
}

const PILL_NAV: PillItem[] = [
  { id: "dashboard", label: "Accueil", href: "/enterprise" },
  { id: "campaigns", label: "Campagnes", href: "/enterprise/campagnes" },
  { id: "performance", label: "Performance", href: "/enterprise/performance" },
  { id: "billing", label: "Facturation", href: "/enterprise/facturation" },
  { id: "team", label: "Équipe", href: "/enterprise/equipe" },
  { id: "assets", label: "Assets", href: "/enterprise/assets" },
  { id: "support", label: "Support", href: "/enterprise/support" },
];

export function enterpriseNavIdForPath(pathname: string): EnterpriseNavId {
  if (pathname === "/enterprise" || pathname === "/enterprise/") return "dashboard";
  if (pathname.startsWith("/enterprise/campagnes")) return "campaigns";
  if (pathname.startsWith("/enterprise/performance")) return "performance";
  if (pathname.startsWith("/enterprise/facturation")) return "billing";
  if (pathname.startsWith("/enterprise/equipe")) return "team";
  if (pathname.startsWith("/enterprise/assets")) return "assets";
  if (pathname.startsWith("/enterprise/support")) return "support";
  if (pathname.startsWith("/enterprise/parametres")) return "settings";
  return "dashboard";
}

export function EnterpriseShell({ children }: EnterpriseShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const current = enterpriseNavIdForPath(pathname || "/enterprise");

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
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
            href="/enterprise"
            className="glass-logo-img"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <Image
              src="/assets/logo-navy.png"
              alt="Publeader"
              width={120}
              height={28}
              style={{ height: 28, width: "auto" }}
            />
            <span className="ent-badge">Annonceur</span>
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
            <Link
              href="/enterprise/campagnes/new"
              className="glass-iconbtn"
              title="Nouvelle campagne"
            >
              <Icon name="plus" size={18} />
            </Link>
            <button type="button" className="glass-iconbtn" title="Notifications">
              <Icon name="bell" size={18} />
              <span className="red-dot" />
            </button>
            <div className="glass-usermenu" ref={menuRef}>
              <button
                type="button"
                className={"glass-avatar" + (menuOpen ? " open" : "")}
                title="Mon compte"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                NC
              </button>
              {menuOpen && (
                <div className="glass-menu" role="menu">
                  <div className="glass-menu-head">
                    <div
                      className="glass-menu-avatar"
                      style={{ background: "linear-gradient(135deg, #EC407A, #F472B6)" }}
                    >
                      NC
                    </div>
                    <div className="glass-menu-ident">
                      <div className="glass-menu-name">Nova Cosmétique</div>
                      <div className="glass-menu-mail">contact@nova-cosmetique.fr</div>
                    </div>
                  </div>
                  <div className="glass-menu-sep" />
                  <Link
                    href="/enterprise/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="user" size={16} />
                    <span>Profil entreprise</span>
                  </Link>
                  <Link
                    href="/enterprise/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="settings" size={16} />
                    <span>Paramètres</span>
                  </Link>
                  <Link
                    href="/enterprise/facturation"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="euro" size={16} />
                    <span>Facturation</span>
                  </Link>
                  <div className="glass-menu-sep" />
                  <Link
                    href="/"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="layout-dashboard" size={16} />
                    <span>Retour admin</span>
                  </Link>
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
