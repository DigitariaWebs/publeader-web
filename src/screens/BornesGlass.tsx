"use client";

/**
 * BornesGlass — rond/vitré bornes map + list.
 * Port of glass-screens.jsx's <BornesGlass>.
 */

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { BORNES as MOCK_BORNES, type Borne } from "@/lib/data";
import { MiniBars } from "@/components/charts";

export function BornesGlass({ bornes }: { bornes?: Borne[] } = {}) {
  const BORNES = bornes ?? MOCK_BORNES;
  const [detail, setDetail] = useState<Borne | null>(null);

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Leader Bornes
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Réseau de diffuseurs parfumés — {BORNES.length} bornes.
          </p>
        </div>
      </div>

      <div className="glass-kpigrid" style={{ marginBottom: 20 }}>
        {[
          { l: "En service", v: String(BORNES.filter((b) => b.status === "En service").length) },
          { l: "Maintenance", v: String(BORNES.filter((b) => b.status === "Maintenance").length) },
          { l: "Hors ligne", v: String(BORNES.filter((b) => b.status === "Hors ligne").length) },
          { l: "Alertes", v: String(BORNES.filter((b) => b.alert).length) },
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

      <div className="glass-mapwrap" style={{ marginBottom: 20 }}>
        <div className="glass-map placeholder-img" style={{ position: "relative", height: 360 }}>
          {BORNES.map((b) => (
            <button
              key={b.id}
              type="button"
              className="glass-pin"
              onClick={() => setDetail(b)}
              style={{
                position: "absolute",
                left: b.x + "%",
                top: b.y + "%",
                background:
                  b.status === "En service"
                    ? "var(--success)"
                    : b.status === "Maintenance"
                    ? "var(--warning)"
                    : "var(--danger)",
              }}
              title={b.name}
            />
          ))}
        </div>
      </div>

      <div className="glass-panel">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Borne</th>
              <th>Type</th>
              <th>Adresse</th>
              <th style={{ textAlign: "right" }}>Sprays</th>
              <th style={{ textAlign: "right" }}>Revenu</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {BORNES.map((b) => (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => setDetail(b)}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td>{b.type}</td>
                <td style={{ color: "var(--gray-500)" }}>{b.address}</td>
                <td style={{ textAlign: "right" }}>{b.sprays.toLocaleString("fr-FR")}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{b.rev}</td>
                <td>
                  <span
                    className={
                      "chip " +
                      (b.status === "En service"
                        ? "chip-success"
                        : b.status === "Maintenance"
                        ? "chip-warning"
                        : "chip-danger")
                    }
                  >
                    <span className="dot" /> {b.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <>
          <div className="glass-backdrop" onClick={() => setDetail(null)} />
          <div className="glass-sheet">
            <div className="glass-sheet-head">
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700 }}>
                  {detail.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                  {detail.type} · {detail.address}
                </div>
              </div>
              <button type="button" className="glass-iconbtn" onClick={() => setDetail(null)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="glass-sheet-body">
              <h4 style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Revenus — 30 jours
              </h4>
              <MiniBars
                data={Array.from({ length: 30 }, (_, i) => 40 + Math.sin(i / 3) * 20 + i)}
              />
              <h4
                style={{
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginTop: 20,
                }}
              >
                Inventaire parfums
              </h4>
              <div className="glass-perfume" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {["Rose #12", "Ambre #07", "Vanille #03", "Cèdre #09", "Jasmin #11"].map((p, i) => {
                  const lvl = [82, 64, 41, 28, 12][i];
                  return (
                    <div
                      key={p}
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <span style={{ width: 90, fontSize: 13 }}>{p}</span>
                      <div style={{ flex: 1, height: 8, background: "rgba(0,0,0,0.08)", borderRadius: 4 }}>
                        <div
                          style={{
                            height: "100%",
                            width: lvl + "%",
                            background:
                              lvl > 50 ? "var(--success)" : lvl > 25 ? "var(--warning)" : "var(--danger)",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ width: 40, fontSize: 12, textAlign: "right" }}>{lvl}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="glass-sheet-foot">
              <button type="button" className="glass-btn glass-btn-primary">
                <Icon name="refresh" size={14} /> Planifier un refill
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
