"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import type { IconName } from "@/components/Icon";
import { useToast } from "@/contexts/ToastContext";
import type { ReportDTO } from "@/lib/report-serializer";
import {
  REPORT_TYPES,
  REPORT_TYPE_LABELS,
  REPORT_TYPE_FORMATS,
  type ReportType,
} from "@/lib/schemas";

const TYPE_ICON: Record<ReportType, IconName> = {
  monthly_summary: "bar-chart-3",
  accounting_export: "banknote",
  borne_performance: "spray-can",
  driver_activity: "car",
  advertiser_engagement: "building-2",
  gdpr_audit: "shield-check",
};

const TYPE_COLOR: Record<ReportType, string> = {
  monthly_summary: "#233466",
  accounting_export: "#3B82F6",
  borne_performance: "#8D6E63",
  driver_activity: "#43A047",
  advertiser_engagement: "#9C27B0",
  gdpr_audit: "#E53935",
};

const TYPE_DESC: Record<ReportType, string> = {
  monthly_summary: "Revenus, campagnes, commissions, marge nette.",
  accounting_export: "Factures, commissions, dépenses (CSV séparés).",
  borne_performance: "Sprays, impressions, recharges, revenus partenaires.",
  driver_activity: "Top performeurs, gains, notes, ville.",
  advertiser_engagement: "Campagnes, impressions, taux de remplissage.",
  gdpr_audit: "Inventaire des PII et durées de rétention.",
};

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mo`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} Ko`;
  return `${n} o`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Default period: first day of current month → today, formatted as YYYY-MM-DD
// for native <input type="date">.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export type ReportsAdminProps = {
  variant: "glass" | "pro";
};

export function ReportsAdmin({ variant }: ReportsAdminProps) {
  const isGlass = variant === "glass";
  const { pushToast } = useToast();
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [type, setType] = useState<ReportType>("monthly_summary");
  const [start, setStart] = useState(monthStartIso());
  const [end, setEnd] = useState(todayIso());

  const reload = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/reports", { credentials: "include" });
      const data = await r.json();
      setReports(data.reports ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          periodStart: new Date(start).toISOString(),
          periodEnd: new Date(end).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushToast({
          kind: "danger",
          title: "Échec génération",
          desc: data.message ?? data.error ?? "Erreur inconnue",
        });
        return;
      }
      pushToast({
        kind: "success",
        title: "Rapport généré",
        desc: REPORT_TYPE_LABELS[type],
      });
      await reload();
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (r: ReportDTO) => {
    if (!confirm(`Supprimer ${r.filename} ?`)) return;
    const res = await fetch(`/api/admin/reports/${r.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      pushToast({ kind: "success", title: "Rapport supprimé" });
      await reload();
    } else {
      pushToast({ kind: "danger", title: "Suppression impossible" });
    }
  };

  const headerSubtitle = useMemo(
    () => "Génération inline puis hébergement Cloudinary.",
    [],
  );

  if (isGlass) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
              Rapports
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
              {headerSubtitle}
            </p>
          </div>
        </div>

        <ReportForm
          type={type}
          setType={setType}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
          onSubmit={submit}
          generating={generating}
          variant={variant}
        />

        <ReportList
          reports={reports}
          loading={loading}
          onRemove={remove}
          variant={variant}
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Rapports</h1>
          <p className="subtitle">{headerSubtitle}</p>
        </div>
      </div>

      <ReportForm
        type={type}
        setType={setType}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        onSubmit={submit}
        generating={generating}
        variant={variant}
      />

      <ReportList
        reports={reports}
        loading={loading}
        onRemove={remove}
        variant={variant}
      />
    </div>
  );
}

type FormProps = {
  type: ReportType;
  setType: (t: ReportType) => void;
  start: string;
  setStart: (s: string) => void;
  end: string;
  setEnd: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  generating: boolean;
  variant: "glass" | "pro";
};

function ReportForm(p: FormProps) {
  return (
    <form
      onSubmit={p.onSubmit}
      className={p.variant === "glass" ? "glass-card" : ""}
      style={{
        background: "#fff",
        border: "1px solid var(--gray-200)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14 }}>Générer un rapport</div>
      <div
        className="grid grid-12"
        style={{
          gap: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {REPORT_TYPES.map((t) => {
          const selected = p.type === t;
          return (
            <label
              key={t}
              style={{
                cursor: "pointer",
                border: `1px solid ${selected ? TYPE_COLOR[t] : "var(--gray-200)"}`,
                background: selected ? `${TYPE_COLOR[t]}10` : "#fff",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <input
                type="radio"
                name="report-type"
                value={t}
                checked={selected}
                onChange={() => p.setType(t)}
                style={{ marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  <Icon
                    name={TYPE_ICON[t]}
                    size={16}
                    style={{ color: TYPE_COLOR[t] }}
                  />
                  {REPORT_TYPE_LABELS[t]}
                </div>
                <div style={{ fontSize: 12, color: "var(--gray-600)", marginTop: 4 }}>
                  {TYPE_DESC[t]}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--gray-500)",
                    marginTop: 4,
                    textTransform: "uppercase",
                  }}
                >
                  {REPORT_TYPE_FORMATS[t]}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--gray-600)" }}>Début</span>
          <input
            type="date"
            value={p.start}
            onChange={(e) => p.setStart(e.target.value)}
            required
            style={{
              border: "1px solid var(--gray-300)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--gray-600)" }}>Fin</span>
          <input
            type="date"
            value={p.end}
            onChange={(e) => p.setEnd(e.target.value)}
            required
            style={{
              border: "1px solid var(--gray-300)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          />
        </label>
        <button
          type="submit"
          disabled={p.generating}
          className={p.variant === "glass" ? "glass-btn glass-btn-primary" : "btn btn-primary"}
        >
          {p.generating ? (
            <>
              <Icon name="refresh" size={16} /> Génération…
            </>
          ) : (
            <>
              <Icon name="plus" size={16} /> Générer
            </>
          )}
        </button>
      </div>
    </form>
  );
}

type ListProps = {
  reports: ReportDTO[];
  loading: boolean;
  onRemove: (r: ReportDTO) => void;
  variant: "glass" | "pro";
};

function ReportList(p: ListProps) {
  if (p.loading) {
    return (
      <div style={{ color: "var(--gray-500)", fontSize: 13 }}>Chargement…</div>
    );
  }
  if (p.reports.length === 0) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px dashed var(--gray-300)",
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          color: "var(--gray-500)",
        }}
      >
        Aucun rapport généré pour le moment.
      </div>
    );
  }
  return (
    <div className="grid grid-12" style={{ gap: 16 }}>
      {p.reports.map((r) => (
        <div
          key={r.id}
          className="col-4"
          style={{
            background: "#fff",
            border: "1px solid var(--gray-200)",
            borderRadius: 12,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                background: TYPE_COLOR[r.type],
                color: "#fff",
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={TYPE_ICON[r.type]} size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.typeLabel}</div>
              <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                {r.format.toUpperCase()} · {fmtBytes(r.byteSize)}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--gray-600)" }}>
            <Icon name="calendar" size={12} /> {fmtDate(r.periodStart)} →{" "}
            {fmtDate(r.periodEnd)}
          </div>
          <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
            Généré le {fmtDate(r.requestedAt)}
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              paddingTop: 10,
              borderTop: "1px solid var(--gray-100)",
            }}
          >
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className={
                p.variant === "glass"
                  ? "glass-btn glass-btn-primary"
                  : "btn btn-secondary compact"
              }
              style={{ flex: 1, textAlign: "center" }}
            >
              <Icon name="download" size={14} /> Télécharger
            </a>
            <button
              type="button"
              onClick={() => p.onRemove(r)}
              className={p.variant === "glass" ? "glass-btn" : "btn btn-ghost compact"}
              title="Supprimer"
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
