"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

type StatsPeriod = "week" | "month" | "3mo" | "year";

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "week", label: "7 jours" },
  { key: "month", label: "30 jours" },
  { key: "3mo", label: "3 mois" },
  { key: "year", label: "1 an" },
];

type DriverStatsResponse = {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    city: string;
    status: string;
  };
  lifetime: {
    campaignsDone: number;
    totalKm: number;
    totalEarnings: number;
    rating: number;
  };
  period: {
    period: StatsPeriod;
    windowStart: string;
    windowEnd: string;
    campaignsDone: number;
    earnings: number;
    km: number;
    activeCampaigns: number;
    growthPercent: number;
    monthlyEarnings: number;
    monthlyBreakdown: { month: string; amount: number; campaigns: number }[];
  };
};

export function ChauffeurDetailPro({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [period, setPeriod] = useState<StatsPeriod>("month");
  const [data, setData] = useState<DriverStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/drivers/${driverId}/stats?period=${period}`, {
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DriverStatsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? "Erreur");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [driverId, period]);

  if (loading && !data) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Chargement…</h1>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>Chauffeur introuvable</h1>
            <p className="subtitle">{error ?? "Aucune donnée."}</p>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => router.push("/chauffeurs")}
          >
            <Icon name="chevron-left" size={16} /> Retour
          </button>
        </div>
      </div>
    );
  }

  const { driver, lifetime, period: p } = data;
  const max = p.monthlyBreakdown.length
    ? Math.max(...p.monthlyBreakdown.map((m) => m.amount))
    : 1;
  const growthIsUp = p.growthPercent >= 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {driver.firstName} {driver.lastName}
          </h1>
          <p className="subtitle">
            {driver.city} · {driver.status}
          </p>
        </div>
        <Link
          href={`/campagnes?driverId=${driver.id}`}
          className="btn btn-primary"
        >
          <Icon name="list" size={16} /> Voir ses campagnes
        </Link>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {PERIODS.map((pp) => (
          <button
            key={pp.key}
            type="button"
            className={
              "chip " + (period === pp.key ? "chip-filled-navy" : "chip-outline")
            }
            onClick={() => setPeriod(pp.key)}
          >
            {pp.label}
          </button>
        ))}
      </div>

      {/* Lifetime panel */}
      <div className="grid grid-12 mb-6" style={{ gap: 16 }}>
        {[
          { l: "Total gagné", v: `${lifetime.totalEarnings.toLocaleString()} €` },
          { l: "Km parcourus", v: `${lifetime.totalKm.toLocaleString()} km` },
          { l: "Campagnes terminées", v: String(lifetime.campaignsDone) },
          { l: "Note", v: lifetime.rating.toFixed(1) },
        ].map((t) => (
          <div
            key={t.l}
            className="col-3"
            style={{
              background: "var(--navy-soft)",
              borderRadius: 10,
              padding: "16px 18px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "var(--navy)",
                textTransform: "uppercase",
              }}
            >
              {t.l}
            </div>
            <div
              className="num"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                fontWeight: 700,
                margin: "4px 0 2px",
              }}
            >
              {t.v}
            </div>
          </div>
        ))}
      </div>

      {/* Period revenue card */}
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
          Revenus · {PERIODS.find((pp) => pp.key === period)?.label.toLowerCase()}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 800,
            color: "var(--navy)",
            margin: "4px 0 8px",
          }}
        >
          {p.earnings.toLocaleString()} €
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 100,
            background: growthIsUp ? "#DCFCE7" : "#FEE2E2",
            color: growthIsUp ? "#166534" : "#991B1B",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Icon
            name={growthIsUp ? "trending-up" : "trending-down"}
            size={12}
          />
          {growthIsUp ? "+" : ""}
          {p.growthPercent}% vs période précédente
        </div>

        <div
          className="grid grid-12"
          style={{ gap: 16, marginTop: 20 }}
        >
          <Stat label="Campagnes terminées" value={String(p.campaignsDone)} />
          <Stat label="Km parcourus" value={`${p.km.toLocaleString()} km`} />
          <Stat
            label="Missions actives"
            value={String(p.activeCampaigns)}
          />
          <Stat
            label="Revenus 30 j roulants"
            value={`${p.monthlyEarnings.toLocaleString()} €`}
          />
        </div>
      </div>

      {/* Monthly breakdown */}
      {p.monthlyBreakdown.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 16, fontSize: 14 }}>Détail mensuel</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {p.monthlyBreakdown.map((m) => (
              <div key={m.month}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{m.month}</span>
                  <span style={{ color: "var(--navy)", fontWeight: 700 }}>
                    {m.amount.toLocaleString()} €
                  </span>
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--gray-500)", marginBottom: 6 }}
                >
                  {m.campaigns} campagne{m.campaigns > 1 ? "s" : ""}
                </div>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    background: "var(--navy-soft)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(m.amount / max) * 100}%`,
                      height: "100%",
                      background: "var(--navy)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-3">
      <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{label}</div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );
}
