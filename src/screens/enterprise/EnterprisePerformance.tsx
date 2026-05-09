"use client";

/**
 * EnterprisePerformance — advertiser analytics dashboard.
 * Period toggle, real impressions trend, city split, campaign split.
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { HorizontalBars } from "@/components/charts";
import type {
  PerformanceDTO,
  PerformancePeriod,
} from "@/lib/campaign-performance-service";

const PERIOD_LABEL: Record<PerformancePeriod, string> = {
  "7d": "7 j",
  "30d": "30 j",
  "90d": "90 j",
  "365d": "Année",
};

const CAMPAIGN_PALETTE = [
  "#EC407A",
  "#A855F7",
  "#3B82F6",
  "#14B8A6",
  "#F59E0B",
  "#43A047",
  "#9CA3AF",
];

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

// Single-series area chart over the impressions timeline.
function ImpressionsArea({
  data,
  height = 260,
  width = 720,
}: {
  data: number[];
  height?: number;
  width?: number;
}) {
  const n = data.length;
  if (n < 2) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--gray-500)",
          fontSize: 13,
        }}
      >
        Pas assez de données pour tracer la courbe.
      </div>
    );
  }
  const pad = { l: 40, r: 16, t: 16, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const maxY = Math.max(1, ...data) * 1.1;
  const dx = w / (n - 1);
  const y = (v: number) => pad.t + h - (v / maxY) * h;
  const path = data
    .map((v, i) => (i === 0 ? "M" : "L") + (pad.l + i * dx) + "," + y(v))
    .join(" ");
  const area = path + ` L${pad.l + w},${pad.t + h} L${pad.l},${pad.t + h} Z`;
  const gridTicks = 4;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: "100%" }}
    >
      {Array.from({ length: gridTicks + 1 }).map((_, i) => {
        const yy = pad.t + (h / gridTicks) * i;
        const val = Math.round(maxY - (maxY / gridTicks) * i);
        return (
          <g key={i}>
            <line
              x1={pad.l}
              x2={pad.l + w}
              y1={yy}
              y2={yy}
              stroke="#E5E5E5"
              strokeWidth="1"
              opacity="0.7"
            />
            <text x={pad.l - 8} y={yy + 3} fill="#737373" fontSize="10" textAnchor="end">
              {fmt(val)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="#3B82F6" opacity="0.2" />
      <path d={path} fill="none" stroke="#3B82F6" strokeWidth="1.8" />
    </svg>
  );
}

export function EnterprisePerformance() {
  const [period, setPeriod] = useState<PerformancePeriod>("30d");
  const [data, setData] = useState<PerformanceDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/me/performance?period=${period}`, {
          credentials: "include",
        });
        const json = (await r.json()) as PerformanceDTO;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const cityRows = useMemo(
    () =>
      (data?.cities ?? []).map((c) => ({ city: c.city, count: c.impressions })),
    [data],
  );

  const campaigns = data?.campaigns ?? [];

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Performance
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Mesurez l&apos;impact de vos campagnes — {PERIOD_LABEL[period]}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="ent-seg">
            {(Object.keys(PERIOD_LABEL) as PerformancePeriod[]).map((p) => (
              <button
                key={p}
                className={period === p ? "active" : ""}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-kpigrid">
        {[
          {
            l: "Impressions",
            v: data ? fmt(data.kpis.impressionsTotal) : "—",
            s: data ? `sur ${data.impressionsTimeline.length} jours` : "—",
          },
          {
            l: "Bornes touchées",
            v: data ? fmt(data.kpis.reachTerminals) : "—",
            s: "terminaux uniques",
          },
          {
            l: "Kilomètres",
            v: data ? `${fmt(data.kpis.kmTotal)} km` : "—",
            s: "cumulés (toutes campagnes)",
          },
          {
            l: "Jours-campagne",
            v: data ? fmt(data.kpis.campaignDays) : "—",
            s: "drivers × jours actifs",
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
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
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
            <h3 style={{ margin: 0, fontSize: 14 }}>Impressions par jour</h3>
            <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
              {data ? fmt(data.kpis.impressionsTotal) : "—"} au total
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <ImpressionsArea data={data?.impressionsTimeline ?? []} />
          </div>
        </div>

        <div className="glass-panel">
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>Répartition par campagne</h3>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {!loading && campaigns.length === 0 && (
              <div style={{ color: "var(--gray-500)", fontSize: 13 }}>
                Aucune impression sur la période.
              </div>
            )}
            {campaigns.map((c, idx) => (
              <div key={c.campaignId} style={{ display: "grid", gap: 4 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <span>
                    {c.brand} {c.brand !== c.title && `· ${c.title}`}
                  </span>
                  <span style={{ color: "var(--gray-500)" }}>{c.pct} %</span>
                </div>
                <div
                  style={{
                    height: 10,
                    background: "rgba(35,52,102,0.08)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: c.pct + "%",
                      height: "100%",
                      background: CAMPAIGN_PALETTE[idx % CAMPAIGN_PALETTE.length],
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ marginTop: 24 }}>
        <div className="glass-panelhead">
          <h3 style={{ margin: 0, fontSize: 14 }}>Couverture par ville</h3>
          <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
            {cityRows.length} ville(s)
          </span>
        </div>
        <div style={{ padding: 16 }}>
          {!loading && cityRows.length === 0 ? (
            <div style={{ color: "var(--gray-500)", fontSize: 13 }}>
              Aucune impression sur la période — la couverture s&apos;affiche dès qu&apos;une borne diffuse.
            </div>
          ) : (
            <HorizontalBars data={cityRows} />
          )}
        </div>
      </div>
    </div>
  );
}
