"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/charts";
import type { AdminDashboardDTO } from "@/lib/dashboard-serializer";

type RevenueChartDTO = {
  range: string;
  points: { date: string; flocageCents: number; borneCents: number }[];
  totals: { flocageCents: number; borneCents: number };
  paidCutoff: string;
};

const VALIDATION_KIND_LABEL: Record<"driver" | "company" | "partner", string> = {
  driver: "Chauffeur",
  company: "Entreprise",
  partner: "Partenaire",
};

function eur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}

function fmtSince(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86_400_000;
  if (diff < day) return "aujourd'hui";
  if (diff < 2 * day) return "hier";
  return `il y a ${Math.floor(diff / day)} j`;
}

function fmtDelta(delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} %`;
}

export function DashboardGlass() {
  const [data, setData] = useState<AdminDashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<"30" | "90" | "365">("30");
  const [chart, setChart] = useState<RevenueChartDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/dashboard", { credentials: "include" });
        const json = (await r.json()) as AdminDashboardDTO;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/dashboard/revenue?range=${chartRange}`, {
          credentials: "include",
        });
        const json = (await r.json()) as RevenueChartDTO;
        if (!cancelled) setChart(json);
      } catch {
        // non-fatal — sparkline falls back to synthetic data
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chartRange]);

  const today = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Use real revenue points when available; fall back to a synthetic shape.
  const sparkData =
    chart && chart.points.length > 0
      ? chart.points.map((p) => p.flocageCents + p.borneCents)
      : data
      ? Array.from({ length: 15 }, (_, i) => 1 + i * 0.5)
      : [];

  const mrr = data?.finance?.collectedCents ?? 0;
  const mrrDelta = data ? fmtDelta(data.mrrDelta) : null;
  const fleet = data?.fleet;
  const counts = data?.counts;

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Vue d&apos;ensemble
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Activité consolidée — Publeader {today}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {(
            [
              { label: "30 j", value: "30" },
              { label: "90 j", value: "90" },
              { label: "12 m", value: "365" },
            ] as { label: string; value: "30" | "90" | "365" }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`glass-btn ghost${chartRange === opt.value ? " active" : ""}`}
              onClick={() => setChartRange(opt.value)}
            >
              {opt.value === "30" && <Icon name="calendar" size={14} />} {opt.label}
            </button>
          ))}
          <Link href="/campagnes/new" className="glass-btn">
            <Icon name="plus" size={14} /> Nouvelle campagne
          </Link>
        </div>
      </div>

      <div
        className="glass-hero"
        style={{
          padding: "28px 32px",
          marginBottom: 20,
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div className="glass-hero-content">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            Encaissé ce mois
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 40,
              fontWeight: 700,
              margin: "4px 0",
            }}
          >
            {loading ? "…" : eur(mrr)}
          </div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {mrrDelta ? `${mrrDelta} vs mois précédent` : "—"}
          </div>
          <div style={{ marginTop: 18 }}>
            <Sparkline data={sparkData.length ? sparkData : [1, 2]} />
          </div>
        </div>
      </div>

      <div className="glass-kpigrid">
        {[
          {
            l: "Campagnes actives",
            v: counts ? fmtNumber(counts.campaignsActive) : "—",
            s:
              counts && counts.campaignsCompletedThisMonth > 0
                ? `${counts.campaignsCompletedThisMonth} terminée(s) ce mois`
                : "—",
          },
          {
            l: "Chauffeurs validés",
            v: counts ? fmtNumber(counts.driversValidated) : "—",
            s: counts
              ? `${counts.driversPending} en attente`
              : "—",
          },
          {
            l: "Bornes en service",
            v: fleet ? `${fleet.online} / ${fleet.installed}` : "—",
            s: fleet
              ? `${fleet.inMaintenance} en maintenance · ${fleet.offline} hors-ligne`
              : "—",
          },
          {
            l: "Dossiers à valider",
            v: counts ? fmtNumber(counts.validationQueueTotal) : "—",
            s: counts
              ? `dont ${counts.validationQueueByKind.driver} chauffeurs`
              : "—",
          },
        ].map((k) => (
          <div key={k.l} className="glass-kpi">
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--gray-500)",
              }}
            >
              {k.l}
            </div>
            <div
              className="num"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 32,
                fontWeight: 700,
                margin: "4px 0",
              }}
            >
              {k.v}
            </div>
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20, marginTop: 24 }}>
        <div className="glass-panel">
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>Campagnes en cours</h3>
            <Link
              href="/campagnes"
              style={{
                fontSize: 12,
                color: "var(--navy)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Voir tout →
            </Link>
          </div>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Ville</th>
                <th style={{ textAlign: "right" }}>Progression</th>
                <th style={{ textAlign: "right" }}>Budget</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentCampaigns ?? [])
                .filter((c) => c.status === "active")
                .slice(0, 5)
                .map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          className="brand-logo"
                          style={{
                            background: c.brandColor ?? "#233466",
                            width: 32,
                            height: 32,
                            fontSize: 12,
                          }}
                        >
                          {c.brand
                            .split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.brand}</div>
                          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                            {c.company}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{c.city}</td>
                    <td style={{ textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          justifyContent: "flex-end",
                        }}
                      >
                        <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                          {c.progress}%
                        </span>
                        <div className="glass-progress" style={{ width: 60 }}>
                          <div style={{ width: c.progress + "%" }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {eur(c.budgetCents)}
                    </td>
                  </tr>
                ))}
              {!loading && (data?.recentCampaigns ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      padding: 24,
                      color: "var(--gray-500)",
                    }}
                  >
                    Aucune campagne récente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel">
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>À valider</h3>
            <Link
              href="/validations"
              style={{
                fontSize: 12,
                color: "var(--navy)",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Voir tout →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
            {(data?.validationQueue ?? []).map((v) => (
              <div
                key={`${v.kind}-${v.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "var(--navy-soft)",
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                    {VALIDATION_KIND_LABEL[v.kind]}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                  {fmtSince(v.since)}
                </div>
              </div>
            ))}
            {!loading && (data?.validationQueue ?? []).length === 0 && (
              <div style={{ color: "var(--gray-500)", fontSize: 13 }}>
                Rien en attente.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: 24 }}>
        <div className="glass-panelhead">
          <h3 style={{ margin: 0, fontSize: 14 }}>Distribution par ville</h3>
        </div>
        <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {(data?.cities ?? []).map((c) => (
            <div key={c.city} className="glass-city-count">
              <div style={{ fontSize: 12, fontWeight: 600 }}>{c.city}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>
                {c.count}
              </div>
            </div>
          ))}
          {!loading && (data?.cities ?? []).length === 0 && (
            <div style={{ color: "var(--gray-500)", fontSize: 13 }}>
              Aucune campagne géolocalisée.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
