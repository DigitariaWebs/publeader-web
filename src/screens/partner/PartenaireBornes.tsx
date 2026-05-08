"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import type { TerminalDTO } from "@/lib/terminal-serializer";

const STATUS_LABEL: Record<TerminalDTO["status"], string> = {
  online: "En service",
  maintenance: "Maintenance",
  offline: "Hors ligne",
};

const STATUS_CHIP: Record<TerminalDTO["status"], string> = {
  online: "chip-success",
  maintenance: "chip-warning",
  offline: "chip-danger",
};

const VENUE_LABEL: Record<TerminalDTO["venueType"], string> = {
  bar: "Bar",
  restaurant: "Restaurant",
  hotel: "Hôtel",
  nightclub: "Nightclub",
  gym: "Salle de sport",
  other: "Autre",
};

function formatRelative(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `il y a ${Math.floor(diff / 3600_000)} h`;
  return `il y a ${Math.floor(diff / 86400_000)} j`;
}

export function PartenaireBornes() {
  const [terminals, setTerminals] = useState<TerminalDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/terminals", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { terminals: TerminalDTO[] };
      })
      .then((data) => {
        if (!cancelled) setTerminals(data.terminals);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onlineCount = terminals.filter((t) => t.status === "online").length;
  const maintenanceCount = terminals.filter(
    (t) => t.status === "maintenance",
  ).length;
  const offlineCount = terminals.filter((t) => t.status === "offline").length;

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Mes bornes
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            État des bornes installées sur votre site — lecture seule.
          </p>
        </div>
      </div>

      {loading && (
        <div className="glass-card" style={{ padding: 32, color: "var(--gray-500)" }}>
          Chargement…
        </div>
      )}
      {error && (
        <div
          className="glass-card"
          style={{ padding: 32, color: "var(--danger)" }}
        >
          Erreur : {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="glass-kpigrid" style={{ marginBottom: 20 }}>
            {[
              { l: "Bornes", v: terminals.length.toString() },
              { l: "En service", v: onlineCount.toString() },
              { l: "Maintenance", v: maintenanceCount.toString() },
              { l: "Hors ligne", v: offlineCount.toString() },
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

          {terminals.length === 0 ? (
            <div
              className="glass-card"
              style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}
            >
              <Icon name="package" size={32} />
              <p style={{ margin: "12px 0 0", fontSize: 14 }}>
                Aucune borne installée. Contactez Publeader pour planifier une installation.
              </p>
            </div>
          ) : (
            <div className="glass-panel">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Borne</th>
                    <th>Type</th>
                    <th>Adresse</th>
                    <th style={{ textAlign: "right" }}>Sprays jour</th>
                    <th>Dernier sync</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div
                          className="mono"
                          style={{ fontSize: 12, color: "var(--gray-500)" }}
                        >
                          #{t.code}
                        </div>
                      </td>
                      <td>{VENUE_LABEL[t.venueType]}</td>
                      <td style={{ color: "var(--gray-500)" }}>{t.address}</td>
                      <td
                        style={{ textAlign: "right", fontWeight: 600 }}
                        className="num"
                      >
                        {t.spraysToday.toLocaleString("fr-FR")}
                      </td>
                      <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                        {formatRelative(t.lastHeartbeatAt)}
                      </td>
                      <td>
                        <span className={"chip " + STATUS_CHIP[t.status]}>
                          <span className="dot" /> {STATUS_LABEL[t.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
