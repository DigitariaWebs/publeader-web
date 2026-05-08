"use client";

/**
 * BornesPro — Leader Borne fleet map + table + detail sheet.
 * 1:1 port of other-screens.jsx's <BornesScreen> + <BorneDetailSheet>.
 */

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { MiniBars } from "@/components/charts";
import { useToast } from "@/contexts/ToastContext";
import { BORNES as MOCK_BORNES, type Borne } from "@/lib/data";

interface BorneDetailSheetProps {
  borne: Borne;
  onClose: () => void;
}

function BorneDetailSheet({ borne, onClose }: BorneDetailSheetProps) {
  const { pushToast } = useToast();
  const perfumes = [
    { n: "Bois de Cèdre", pct: 82 },
    { n: "Fleur d'Oranger", pct: 64 },
    { n: "Ambre Noir", pct: 45 },
    { n: "Rose Musquée", pct: 18 },
    { n: "Vétiver", pct: 71 },
  ];
  const lvl = (p: number) => (p > 60 ? "high" : p >= 20 ? "mid" : "low");

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" style={{ width: 640 }}>
        <div
          style={{
            position: "relative",
            height: 200,
            background: "linear-gradient(135deg, var(--navy-dark), var(--navy))",
            color: "#fff",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="placeholder-img"
            style={{ position: "absolute", inset: 0, opacity: 0.18, borderRadius: 0 }}
          >
            photo du lieu
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ position: "absolute", top: 16, right: 16, color: "#fff" }}
            onClick={onClose}
          >
            <Icon name="x" size={18} />
          </button>
          <div style={{ position: "relative", zIndex: 1 }}>
            <span
              className="chip chip-soft-navy"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff", marginBottom: 8 }}
            >
              {borne.type}
            </span>
            <h2
              style={{
                margin: "0 0 4px",
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {borne.name}
            </h2>
            <div style={{ fontSize: 13, color: "var(--navy-soft)", opacity: 0.9 }}>
              {borne.address} · Dernier refill {borne.refill}
            </div>
          </div>
        </div>
        <div className="sheet-body">
          <div className="section-label">INVENTAIRE PARFUMS</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {perfumes.map((p) => (
              <div
                key={p.n}
                style={{
                  border: "1px solid var(--gray-200)",
                  borderRadius: 10,
                  padding: 12,
                  textAlign: "center",
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <div className="perfume-bar">
                    <div
                      className={"perfume-fill " + lvl(p.pct)}
                      style={{ height: p.pct + "%" }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, minHeight: 28, lineHeight: 1.3 }}>
                  {p.n}
                </div>
                <div
                  className="num"
                  style={{ fontSize: 13, color: "var(--navy)", fontWeight: 700, marginTop: 4 }}
                >
                  {p.pct}%
                </div>
              </div>
            ))}
          </div>

          <div className="section-label">REVENUS — 30 JOURS</div>
          <div
            style={{
              background: "var(--navy-tint)",
              borderRadius: 10,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>Revenus mensuels</div>
                <div
                  className="num"
                  style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 700 }}
                >
                  {borne.rev}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "var(--gray-500)" }}>Sprays ce mois</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>
                  {borne.sprays.toLocaleString("fr-FR")}
                </div>
              </div>
            </div>
            <MiniBars
              data={Array.from(
                { length: 30 },
                (_, i) => 10 + Math.sin(i / 2) * 6 + (i % 7 === 0 ? 8 : 0) + i * 0.3,
              )}
              height={80}
            />
          </div>

          <div className="section-label">DIFFUSION ÉCRAN LED</div>
          <div style={{ border: "1px solid var(--gray-200)", borderRadius: 10, overflow: "hidden" }}>
            {[
              { c: "Renault Électrique", share: 45, color: "#FDD835", i: "R" },
              { c: "Le Clos des Vignes", share: 30, color: "#8D6E63", i: "CV" },
              { c: "Kalis Gym", share: 25, color: "#E53935", i: "KG" },
            ].map((r) => (
              <div
                key={r.c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--gray-100)",
                }}
              >
                <div className="brand-logo sm" style={{ background: r.color }}>
                  {r.i}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{r.c}</div>
                <div style={{ width: 160 }}>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: r.share + "%" }} />
                  </div>
                </div>
                <span
                  className="num"
                  style={{ fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: "right" }}
                >
                  {r.share}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="sheet-footer">
          <button type="button" className="btn btn-ghost btn-danger-ghost">
            Retirer la borne
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary">
              Mettre en maintenance
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                pushToast({
                  kind: "success",
                  title: "Refill planifié",
                  desc: borne.name + " — jeudi 23 avr.",
                });
                onClose();
              }}
            >
              <Icon name="refresh" size={14} /> Planifier un refill
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function BornesPro({ bornes }: { bornes?: Borne[] } = {}) {
  const BORNES = bornes ?? MOCK_BORNES;
  const [detail, setDetail] = useState<Borne | null>(null);
  const [hover, setHover] = useState<Borne | null>(null);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "var(--navy-light)",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Leader Borne · parfum + écran LED
          </div>
          <h1>Leader Bornes</h1>
          <p className="subtitle">Fleet de bornes installées chez vos partenaires.</p>
        </div>
        <button type="button" className="btn btn-primary">
          <Icon name="plus" size={18} /> Installer une borne
        </button>
      </div>

      <div className="grid grid-12 mb-6" style={{ gap: 16 }}>
        {[
          { l: "Bornes installées", v: "8", s: "7 en service" },
          { l: "Revenus ce mois", v: "2 130 €", s: "+12 % vs mars" },
          { l: "Sprays / jour", v: "46", s: "moyenne par borne" },
          { l: "Remplissage parfum", v: "72 %", s: "2 bornes à refill" },
        ].map((t) => (
          <div
            key={t.l}
            className="col-3"
            style={{ background: "var(--navy-soft)", borderRadius: 10, padding: "16px 18px" }}
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
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{t.s}</div>
          </div>
        ))}
      </div>

      <div className="card-flush card mb-6" style={{ overflow: "hidden" }}>
        <div className="map-placeholder" style={{ height: 360, position: "relative" }}>
          {BORNES.map((b) => (
            <div
              key={b.id}
              className="map-pin"
              style={{ left: b.x + "%", top: b.y + "%" }}
              onMouseEnter={() => setHover(b)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setDetail(b)}
            >
              <Icon name="map-pin" size={32} />
            </div>
          ))}
          {hover && (
            <div
              style={{
                position: "absolute",
                left: hover.x + "%",
                top: hover.y + "%",
                transform: "translate(-50%, -120%)",
                background: "#fff",
                borderRadius: 8,
                padding: "8px 12px",
                boxShadow: "var(--shadow-raised)",
                minWidth: 180,
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{hover.name}</div>
              <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
                Dernier refill {hover.refill}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card card-flush">
        <div
          style={{
            padding: "16px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h3 className="card-title">Toutes les bornes</h3>
          <button type="button" className="btn btn-ghost compact">
            <Icon name="download" size={14} /> Exporter CSV
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Borne</th>
              <th>Type</th>
              <th>Adresse</th>
              <th>Statut</th>
              <th>Dernier refill</th>
              <th style={{ textAlign: "right" }}>Sprays</th>
              <th style={{ textAlign: "right" }}>Revenus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {BORNES.map((b) => (
              <tr key={b.id} onClick={() => setDetail(b)}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "var(--navy-soft)",
                        color: "var(--navy)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="spray-can" size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {b.name}{" "}
                        {b.alert && (
                          <Icon
                            name="alert-triangle"
                            size={14}
                            style={{
                              color: "var(--warning)",
                              marginLeft: 4,
                              verticalAlign: "-2px",
                            }}
                          />
                        )}
                      </div>
                      <div
                        style={{ fontSize: 12, color: "var(--gray-500)" }}
                        className="mono"
                      >
                        #{b.id.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </td>
                <td>{b.type}</td>
                <td style={{ color: "var(--gray-600)" }}>{b.address}</td>
                <td>
                  {b.status === "En service" && (
                    <span className="chip chip-success">
                      <span className="dot" />
                      En service
                    </span>
                  )}
                  {b.status === "Maintenance" && (
                    <span className="chip chip-warning">
                      <span className="dot" />
                      Maintenance
                    </span>
                  )}
                  {b.status === "Hors ligne" && (
                    <span className="chip chip-danger">
                      <span className="dot" />
                      Hors ligne
                    </span>
                  )}
                </td>
                <td style={{ color: "var(--gray-500)" }}>{b.refill}</td>
                <td style={{ textAlign: "right" }} className="num fw-600">
                  {b.sprays.toLocaleString("fr-FR")}
                </td>
                <td style={{ textAlign: "right" }} className="num fw-600">
                  {b.rev}
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Icon name="more-horizontal" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && <BorneDetailSheet borne={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
