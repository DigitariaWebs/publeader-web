"use client";

/**
 * GlassShell — the "rond/vitré" UI wrapper with a top pill nav.
 * 1:1 port of glass-screens.jsx's <GlassShell>.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { navIdForPath } from "@/lib/nav";
import { useUiState } from "@/contexts/UiStateContext";

interface GlassShellProps {
  children: ReactNode;
}

interface PillItem {
  id: string;
  label: string;
  href: string;
}

const PILL_NAV: PillItem[] = [
  { id: "dashboard", label: "Home", href: "/" },
  { id: "campaigns", label: "Campagnes", href: "/campagnes" },
  { id: "validations", label: "Validations", href: "/validations" },
  { id: "bornes", label: "Bornes", href: "/bornes" },
  { id: "finances", label: "Finances", href: "/finances" },
  { id: "settings", label: "Paramètres", href: "/parametres" },
];

export function GlassShell({ children }: GlassShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const current = navIdForPath(pathname || "/");
  const { openCmdk, openNotifs } = useUiState();

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

  // Close the menu whenever the route changes
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
          <Link href="/" className="glass-logo-img">
            <Image
              src="/assets/logo-navy.png"
              alt="Publeader"
              width={120}
              height={28}
              style={{ height: 28, width: "auto" }}
            />
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
            <button
              type="button"
              className="glass-iconbtn"
              onClick={openCmdk}
              title="Recherche (⌘K)"
            >
              <Icon name="search" size={18} />
            </button>
            <button type="button" className="glass-iconbtn" onClick={openNotifs}>
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
                CL
              </button>
              {menuOpen && (
                <div className="glass-menu" role="menu">
                  <div className="glass-menu-head">
                    <div className="glass-menu-avatar">CL</div>
                    <div className="glass-menu-ident">
                      <div className="glass-menu-name">Clément Laurent</div>
                      <div className="glass-menu-mail">clement@publeader.fr</div>
                    </div>
                  </div>
                  <div className="glass-menu-sep" />
                  <Link
                    href="/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="user" size={16} />
                    <span>Mon profil</span>
                  </Link>
                  <Link
                    href="/parametres"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="settings" size={16} />
                    <span>Paramètres</span>
                  </Link>
                  <Link
                    href="/finances"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="euro" size={16} />
                    <span>Facturation</span>
                  </Link>
                  <div className="glass-menu-sep" />
                  <Link
                    href="/enterprise"
                    className="glass-menu-item"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon name="building-2" size={16} />
                    <span>Portail annonceur</span>
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
