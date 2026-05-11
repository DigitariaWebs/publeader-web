"use client";

/**
 * EntreprisesGlass — rond/vitré companies grid.
 * Port of glass-screens.jsx's <EntreprisesGlass>.
 * Data fetched from /api/admin/companies.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

interface Company {
  id: string;
  name: string;
  status: string;
  sector: string;
  city: string;
  brandColor?: string;
}

const STATUS_LABELS: Record<string, string> = {
  Actif: "Actif",
  Nouveau: "Nouveau",
  Pause: "Pause",
};

const FALLBACK_COLORS = [
  "#0EA5E9", "#8B5CF6", "#EC4899", "#F59E0B",
  "#10B981", "#EF4444", "#6366F1", "#14B8A6",
];

function brandColor(c: Company, index: number): string {
  return c.brandColor || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function showToast(message: string) {
  // Simple toast — create a temporary element if no toast lib is wired.
  const el = document.createElement("div");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: "rgba(0,0,0,0.80)",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: "10px",
    fontSize: "14px",
    zIndex: "9999",
    backdropFilter: "blur(8px)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

export function EntreprisesGlass() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSector, setActiveSector] = useState<string>("Tous");
  const [activeStatus, setActiveStatus] = useState<string>("Tous");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/admin/companies", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        return res.json();
      })
      .then((data: { companies: Company[] }) => {
        setCompanies(data.companies ?? []);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  // Derive unique sectors and statuses from fetched data.
  const sectors = ["Tous", ...Array.from(new Set(companies.map((c) => c.sector))).sort()];
  const statuses = ["Tous", ...Array.from(new Set(companies.map((c) => c.status))).sort()];

  const filtered = companies.filter((c) => {
    const sectorMatch = activeSector === "Tous" || c.sector === activeSector;
    const statusMatch = activeStatus === "Tous" || c.status === activeStatus;
    return sectorMatch && statusMatch;
  });

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>Entreprises</h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            {loading
              ? "Chargement…"
              : error
              ? "Erreur de chargement"
              : `Annonceurs clients — ${filtered.length} affichée${filtered.length !== 1 ? "s" : ""} / ${companies.length} au total.`}
          </p>
        </div>
        <button type="button" className="glass-btn glass-btn-primary">
          <Icon name="plus" size={14} /> Nouvelle entreprise
        </button>
      </div>

      {/* Sector filter chips */}
      {!loading && !error && sectors.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSector(s)}
              className={`glass-chip${activeSector === s ? " glass-chip-active" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Status filter chips */}
      {!loading && !error && statuses.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveStatus(s)}
              className={`glass-chip${activeStatus === s ? " glass-chip-active" : ""}`}
            >
              {STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="glass-cardgrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-tile" style={{ opacity: 0.5, minHeight: 130 }} />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--gray-500)",
            fontSize: 14,
          }}
        >
          <Icon name="alert-triangle" size={32} />
          <p style={{ marginTop: 12 }}>{error}</p>
          <button
            type="button"
            className="glass-btn"
            style={{ marginTop: 12 }}
            onClick={() => {
              setLoading(true);
              setError(null);
              fetch("/api/admin/companies", { credentials: "include" })
                .then((r) => {
                  if (!r.ok) throw new Error(`Erreur ${r.status}`);
                  return r.json();
                })
                .then((data: { companies: Company[] }) => setCompanies(data.companies ?? []))
                .catch((err: Error) => setError(err.message))
                .finally(() => setLoading(false));
            }}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--gray-500)",
            fontSize: 14,
          }}
        >
          <Icon name="building-2" size={32} />
          <p style={{ marginTop: 12 }}>Aucune entreprise trouvée pour ces filtres.</p>
        </div>
      )}

      {/* Company grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="glass-cardgrid">
          {filtered.map((c, index) => (
            <div
              key={c.id}
              className="glass-tile"
              style={{ cursor: "pointer" }}
              onClick={() => showToast(`Voir les campagnes de ${c.name}`)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  className="brand-logo"
                  style={{
                    background: brandColor(c, index),
                    width: 40,
                    height: 40,
                    fontSize: 15,
                  }}
                >
                  {c.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{c.sector}</div>
                </div>
                {c.status && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        c.status === "Actif"
                          ? "rgba(16,185,129,0.15)"
                          : c.status === "Nouveau"
                          ? "rgba(99,102,241,0.15)"
                          : "rgba(245,158,11,0.15)",
                      color:
                        c.status === "Actif"
                          ? "#059669"
                          : c.status === "Nouveau"
                          ? "#4F46E5"
                          : "#D97706",
                    }}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--gray-500)" }}>
                <Icon name="map-pin" size={12} /> {c.city}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
