"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type {
  AdScheduleDTO,
  AdImpressionDailyDTO,
  AdIssueReportDTO,
} from "@/lib/ad-serializer";
import type { TerminalDTO } from "@/lib/terminal-serializer";
import { AD_ISSUE_KINDS, type AdIssueKind } from "@/lib/schemas";

const STATUS_LABEL: Record<AdScheduleDTO["liveStatus"], string> = {
  live: "En ligne",
  scheduled: "Planifiée",
  paused: "En pause",
  expired: "Terminée",
  cancelled: "Annulée",
};

const STATUS_CHIP: Record<AdScheduleDTO["liveStatus"], string> = {
  live: "chip-success",
  scheduled: "chip-warning",
  paused: "chip-warning",
  expired: "chip-soft-navy",
  cancelled: "chip-soft-navy",
};

const KIND_LABEL: Record<AdIssueKind, string> = {
  not_playing: "Ne diffuse pas",
  wrong_content: "Mauvais contenu",
  audio_issue: "Son défectueux",
  screen_issue: "Écran défectueux",
  other: "Autre",
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function PartenairePublicites() {
  const [terminals, setTerminals] = useState<TerminalDTO[]>([]);
  const [schedules, setSchedules] = useState<AdScheduleDTO[]>([]);
  const [impressions, setImpressions] = useState<AdImpressionDailyDTO[]>([]);
  const [issues, setIssues] = useState<AdIssueReportDTO[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportingScheduleId, setReportingScheduleId] = useState<string | null>(
    null,
  );

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s, i, iss] = await Promise.all([
        fetch("/api/me/terminals", { credentials: "include" }).then((r) =>
          r.json(),
        ),
        fetch("/api/me/ad-schedules", { credentials: "include" }).then((r) =>
          r.json(),
        ),
        fetch("/api/me/ad-impressions?days=7", { credentials: "include" }).then(
          (r) => r.json(),
        ),
        fetch("/api/me/ad-issues", { credentials: "include" }).then((r) =>
          r.json(),
        ),
      ]);
      setTerminals(t.terminals ?? []);
      setSchedules(s.schedules ?? []);
      setImpressions(i.rows ?? []);
      setIssues(iss.issues ?? []);
      if (!selectedTerminalId && t.terminals?.length) {
        setSelectedTerminalId(t.terminals[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSchedules = useMemo(() => {
    if (!selectedTerminalId) return schedules;
    return schedules.filter((s) => s.terminalId === selectedTerminalId);
  }, [schedules, selectedTerminalId]);

  const totalImpressions7d = impressions.reduce(
    (sum, r) => sum + r.impressions,
    0,
  );
  const liveCount = schedules.filter((s) => s.liveStatus === "live").length;
  const openIssues = issues.filter((i) => i.status === "open").length;

  const reportingSchedule = schedules.find((s) => s.id === reportingScheduleId);

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Publicités
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Programmation et performance des écrans LED.
          </p>
        </div>
      </div>

      {error && (
        <div
          className="glass-card"
          style={{ padding: 16, color: "var(--danger)", marginBottom: 16 }}
        >
          Erreur : {error}
        </div>
      )}

      {terminals.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            className={
              "chip " +
              (selectedTerminalId === null ? "chip-navy" : "chip-soft-navy")
            }
            onClick={() => setSelectedTerminalId(null)}
            style={{ cursor: "pointer" }}
          >
            Toutes
          </button>
          {terminals.map((t) => (
            <button
              key={t.id}
              type="button"
              className={
                "chip " +
                (t.id === selectedTerminalId ? "chip-navy" : "chip-soft-navy")
              }
              onClick={() => setSelectedTerminalId(t.id)}
              style={{ cursor: "pointer" }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="glass-kpigrid" style={{ marginBottom: 20 }}>
        {[
          { l: "En ligne", v: liveCount.toString() },
          { l: "Programmées", v: schedules.length.toString() },
          { l: "Vues 7j", v: totalImpressions7d.toLocaleString("fr-FR") },
          { l: "Signalements ouverts", v: openIssues.toString() },
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
                fontSize: 32,
                fontWeight: 700,
                margin: "4px 0",
              }}
            >
              {k.v}
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div
          className="glass-card"
          style={{ padding: 32, color: "var(--gray-500)" }}
        >
          Chargement…
        </div>
      ) : filteredSchedules.length === 0 ? (
        <div
          className="glass-card"
          style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}
        >
          <Icon name="tv" size={32} />
          <p style={{ margin: "12px 0 0", fontSize: 14 }}>
            Aucune publicité programmée sur cette borne.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ marginBottom: 20 }}>
          <h3 style={{ padding: "16px 20px 0", margin: 0, fontSize: 14 }}>
            Programmation
          </h3>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Borne</th>
                <th>Fenêtre</th>
                <th>Fréquence</th>
                <th style={{ textAlign: "right" }}>Vues 7j</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedules.map((s) => {
                const sumImp = impressions
                  .filter(
                    (r) =>
                      r.terminalId === s.terminalId &&
                      r.campaignId === s.campaignId,
                  )
                  .reduce((sum, r) => sum + r.impressions, 0);
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {s.campaignTitle ?? s.campaignId}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {s.campaignBrand}
                      </div>
                    </td>
                    <td>{s.terminalName ?? s.terminalId}</td>
                    <td>
                      {pad(s.startHour)}h - {pad(s.endHour)}h
                      {s.inWindowNow && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: "var(--success)",
                            fontWeight: 600,
                          }}
                        >
                          ● en cours
                        </span>
                      )}
                    </td>
                    <td>{s.intervalSeconds}s</td>
                    <td
                      className="num"
                      style={{ textAlign: "right", fontWeight: 600 }}
                    >
                      {sumImp.toLocaleString("fr-FR")}
                    </td>
                    <td>
                      <span className={"chip " + STATUS_CHIP[s.liveStatus]}>
                        <span className="dot" /> {STATUS_LABEL[s.liveStatus]}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-ghost compact"
                        onClick={() => setReportingScheduleId(s.id)}
                      >
                        <Icon name="alert-triangle" size={13} /> Signaler
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="glass-panel">
        <h3 style={{ padding: "16px 20px 0", margin: 0, fontSize: 14 }}>
          Mes signalements
        </h3>
        {issues.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: "var(--gray-500)",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Aucun signalement.
          </div>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Campagne</th>
                <th>Borne</th>
                <th>Type</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                    {new Date(i.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td>{i.campaignTitle ?? i.campaignId}</td>
                  <td>{i.terminalName ?? i.terminalId}</td>
                  <td>{KIND_LABEL[i.kind]}</td>
                  <td>
                    <span
                      className={
                        "chip " +
                        (i.status === "resolved"
                          ? "chip-success"
                          : i.status === "dismissed"
                          ? "chip-soft-navy"
                          : "chip-warning")
                      }
                    >
                      {i.status === "open"
                        ? "Ouvert"
                        : i.status === "resolved"
                        ? "Résolu"
                        : "Rejeté"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reportingSchedule && (
        <ReportModal
          schedule={reportingSchedule}
          onClose={() => setReportingScheduleId(null)}
          onSubmitted={async () => {
            setReportingScheduleId(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function ReportModal({
  schedule,
  onClose,
  onSubmitted,
}: {
  schedule: AdScheduleDTO;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const [kind, setKind] = useState<AdIssueKind>("not_playing");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!description.trim()) {
      setErr("Description requise");
      return;
    }
    setSubmitting(true);
    setErr(null);
    const res = await fetch("/api/me/ad-issues", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: schedule.id,
        kind,
        description: description.trim(),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      setErr(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      return;
    }
    await onSubmitted();
  };

  return (
    <>
      <div className="glass-backdrop" onClick={onClose} />
      <div className="glass-sheet" style={{ width: 480 }}>
        <div className="glass-sheet-head">
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700 }}>
              Signaler un problème
            </div>
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
              {schedule.campaignTitle} · {schedule.terminalName}
            </div>
          </div>
          <button type="button" className="glass-iconbtn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="glass-sheet-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AD_ISSUE_KINDS.map((k) => (
              <label
                key={k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  border: "1px solid var(--gray-200)",
                  borderRadius: 10,
                  cursor: "pointer",
                  background:
                    kind === k ? "var(--navy-soft)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {KIND_LABEL[k]}
                </span>
              </label>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description du problème"
            rows={4}
            maxLength={1000}
            style={{
              marginTop: 16,
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid var(--gray-200)",
              fontFamily: "inherit",
              fontSize: 13,
              resize: "vertical",
            }}
          />
          {err && (
            <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 13 }}>
              {err}
            </div>
          )}
        </div>
        <div className="glass-sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="glass-btn glass-btn-primary"
            disabled={submitting || !description.trim()}
            onClick={submit}
          >
            {submitting ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </>
  );
}
