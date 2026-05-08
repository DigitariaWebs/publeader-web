"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import type {
  AdScheduleDTO,
  AdIssueReportDTO,
} from "@/lib/ad-serializer";
import { type AdIssueKind } from "@/lib/schemas";

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

type Tab = "schedules" | "issues";

export function AdsAdminPro() {
  const [tab, setTab] = useState<Tab>("schedules");
  const [schedules, setSchedules] = useState<AdScheduleDTO[]>([]);
  const [issues, setIssues] = useState<AdIssueReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState<AdScheduleDTO | null>(
    null,
  );
  const [resolvingIssue, setResolvingIssue] = useState<AdIssueReportDTO | null>(
    null,
  );

  const reload = async () => {
    setLoading(true);
    const [s, i] = await Promise.all([
      fetch("/api/admin/ad-schedules", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/ad-issues?status=open", {
        credentials: "include",
      }).then((r) => r.json()),
    ]);
    setSchedules(s.schedules ?? []);
    setIssues(i.issues ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const counts = useMemo(
    () => ({
      live: schedules.filter((s) => s.liveStatus === "live").length,
      paused: schedules.filter((s) => s.liveStatus === "paused").length,
      scheduled: schedules.filter((s) => s.liveStatus === "scheduled").length,
      issues: issues.filter((i) => i.status === "open").length,
    }),
    [schedules, issues],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Publicités</h1>
          <p className="subtitle">
            Programmation des écrans LED et signalements partenaires.
          </p>
        </div>
      </div>

      <div className="grid grid-12 mb-6" style={{ gap: 16 }}>
        {[
          { l: "En ligne", v: counts.live.toString() },
          { l: "En pause", v: counts.paused.toString() },
          { l: "Planifiées", v: counts.scheduled.toString() },
          { l: "Signalements ouverts", v: counts.issues.toString() },
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
                fontSize: 28,
                fontWeight: 700,
                margin: "4px 0 2px",
              }}
            >
              {t.v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className={
            "btn compact " + (tab === "schedules" ? "btn-primary" : "btn-ghost")
          }
          onClick={() => setTab("schedules")}
        >
          Programmation ({schedules.length})
        </button>
        <button
          type="button"
          className={
            "btn compact " + (tab === "issues" ? "btn-primary" : "btn-ghost")
          }
          onClick={() => setTab("issues")}
        >
          Signalements ouverts ({counts.issues})
        </button>
      </div>

      <div className="card card-flush">
        {loading ? (
          <div style={{ padding: 32, color: "var(--gray-500)" }}>
            Chargement…
          </div>
        ) : tab === "schedules" ? (
          <SchedulesTable
            schedules={schedules}
            onEdit={(s) => setEditingSchedule(s)}
            onAction={async (id, action) => {
              await fetch(`/api/admin/ad-schedules/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action }),
              });
              await reload();
            }}
          />
        ) : (
          <IssuesTable
            issues={issues}
            onResolve={(i) => setResolvingIssue(i)}
          />
        )}
      </div>

      {editingSchedule && (
        <ScheduleEditModal
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
          onSaved={async () => {
            setEditingSchedule(null);
            await reload();
          }}
        />
      )}
      {resolvingIssue && (
        <ResolveIssueModal
          issue={resolvingIssue}
          onClose={() => setResolvingIssue(null)}
          onDone={async () => {
            setResolvingIssue(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function SchedulesTable({
  schedules,
  onEdit,
  onAction,
}: {
  schedules: AdScheduleDTO[];
  onEdit: (s: AdScheduleDTO) => void;
  onAction: (id: string, action: "pause" | "resume") => Promise<void>;
}) {
  if (schedules.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "var(--gray-500)",
        }}
      >
        <Icon name="tv" size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>
          Aucune programmation. Assignez une borne à une campagne pour créer
          un planning.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Campagne</th>
          <th>Borne</th>
          <th>Fenêtre</th>
          <th>Fréquence</th>
          <th>Statut</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {schedules.map((s) => (
          <tr key={s.id}>
            <td>
              <div style={{ fontWeight: 600 }}>
                {s.campaignTitle ?? s.campaignId}
              </div>
              <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                {s.campaignBrand}
              </div>
            </td>
            <td>
              <div>{s.terminalName ?? s.terminalId}</div>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--gray-500)" }}
              >
                {s.terminalCode}
              </div>
            </td>
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
                  ●
                </span>
              )}
            </td>
            <td>{s.intervalSeconds}s</td>
            <td>
              <span className={"chip " + STATUS_CHIP[s.liveStatus]}>
                <span className="dot" /> {STATUS_LABEL[s.liveStatus]}
              </span>
            </td>
            <td style={{ textAlign: "right" }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-ghost compact"
                  onClick={() => onEdit(s)}
                >
                  Modifier
                </button>
                {s.status === "paused" ? (
                  <button
                    type="button"
                    className="btn btn-secondary compact"
                    onClick={() => onAction(s.id, "resume")}
                  >
                    Reprendre
                  </button>
                ) : (
                  s.liveStatus !== "expired" &&
                  s.liveStatus !== "cancelled" && (
                    <button
                      type="button"
                      className="btn btn-ghost compact"
                      onClick={() => onAction(s.id, "pause")}
                    >
                      Pause
                    </button>
                  )
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IssuesTable({
  issues,
  onResolve,
}: {
  issues: AdIssueReportDTO[];
  onResolve: (i: AdIssueReportDTO) => void;
}) {
  if (issues.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "var(--gray-500)",
        }}
      >
        <Icon name="check-circle" size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>
          Aucun signalement ouvert.
        </p>
      </div>
    );
  }
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Campagne</th>
          <th>Borne</th>
          <th>Type</th>
          <th>Description</th>
          <th></th>
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
            <td style={{ maxWidth: 300 }}>{i.description}</td>
            <td style={{ textAlign: "right" }}>
              <button
                type="button"
                className="btn btn-primary compact"
                onClick={() => onResolve(i)}
              >
                Traiter
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScheduleEditModal({
  schedule,
  onClose,
  onSaved,
}: {
  schedule: AdScheduleDTO;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [startHour, setStartHour] = useState(schedule.startHour);
  const [endHour, setEndHour] = useState(schedule.endHour);
  const [intervalSeconds, setIntervalSeconds] = useState(
    schedule.intervalSeconds,
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    const res = await fetch(`/api/admin/ad-schedules/${schedule.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startHour, endHour, intervalSeconds }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setErr(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      return;
    }
    await onSaved();
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" style={{ width: 480 }}>
        <div className="sheet-head">
          <h2>Modifier le planning</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
            {schedule.campaignTitle} sur {schedule.terminalName}
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Heure début (0–23)
              </div>
              <input
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--gray-200)",
                }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Heure fin (0–23)
              </div>
              <input
                type="number"
                min={0}
                max={23}
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--gray-200)",
                }}
              />
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 11,
                  color: "var(--gray-500)",
                }}
              >
                Si fin &lt; début, fenêtre traverse minuit (ex 20h → 4h).
              </p>
            </label>
            <label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Fréquence (secondes)
              </div>
              <input
                type="number"
                min={10}
                max={3600}
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--gray-200)",
                }}
              />
            </label>
          </div>
          {err && (
            <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>
              {err}
            </div>
          )}
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </>
  );
}

function ResolveIssueModal({
  issue,
  onClose,
  onDone,
}: {
  issue: AdIssueReportDTO;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const act = async (action: "resolve" | "dismiss") => {
    setSubmitting(true);
    setErr(null);
    const res = await fetch(`/api/admin/ad-issues/${issue.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, resolution: resolution.trim() || undefined }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setErr(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      return;
    }
    await onDone();
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" style={{ width: 520 }}>
        <div className="sheet-head">
          <h2>Traiter le signalement</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <p style={{ fontSize: 13, color: "var(--gray-500)" }}>
            {issue.campaignTitle} · {issue.terminalName}
          </p>
          <div
            style={{
              padding: 12,
              borderRadius: 10,
              background: "var(--navy-soft)",
              fontSize: 13,
              marginTop: 12,
            }}
          >
            <strong>{KIND_LABEL[issue.kind]}</strong>
            <p style={{ margin: "6px 0 0" }}>{issue.description}</p>
          </div>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Résolution (optionnel)"
            rows={3}
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
            <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>
              {err}
            </div>
          )}
        </div>
        <div className="sheet-footer">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={submitting}
            onClick={() => act("dismiss")}
          >
            Rejeter
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting}
            onClick={() => act("resolve")}
          >
            {submitting ? "Envoi…" : "Marquer résolu"}
          </button>
        </div>
      </div>
    </>
  );
}
