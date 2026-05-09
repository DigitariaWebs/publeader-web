"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { StackedArea } from "@/components/charts";
import type { ExpenseDTO, InvoiceDTO } from "@/lib/finance-serializer";
import type { CommissionRow } from "@/lib/commission-service";
import type { FinanceKpiDTO } from "@/lib/finance-kpi-service";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/schemas";

type StatusFilter = "all" | "paid" | "pending" | "late";

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " €";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

const STATUS_LABEL: Record<InvoiceDTO["status"], string> = {
  brouillon: "Brouillon",
  envoyee: "En cours",
  payee: "Payée",
  en_retard: "En retard",
};

const COLORS = [
  "#FDD835",
  "#8D6E63",
  "#9C27B0",
  "#43A047",
  "#E53935",
  "#795548",
  "#0EA5E9",
  "#EC407A",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function matchesStatus(s: InvoiceDTO["status"], f: StatusFilter): boolean {
  if (f === "all") return true;
  if (f === "paid") return s === "payee";
  if (f === "pending") return s === "envoyee";
  return s === "en_retard";
}

export function FinancesGlass() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kpis, setKpis] = useState<FinanceKpiDTO | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [k, i, c, e] = await Promise.all([
      fetch("/api/admin/finance-kpis", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/invoices", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/commissions", { credentials: "include" }).then((r) =>
        r.json(),
      ),
      fetch("/api/admin/expenses", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    ]);
    setKpis(k.kpis ?? null);
    setInvoices(i.invoices ?? []);
    setCommissions(c.commissions ?? []);
    setExpenses(e.expenses ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredInvoices = useMemo(
    () => invoices.filter((i) => matchesStatus(i.status, statusFilter)),
    [invoices, statusFilter],
  );

  const counts = useMemo(() => {
    const all = invoices.length;
    const paid = invoices.filter((i) => i.status === "payee").length;
    const pending = invoices.filter((i) => i.status === "envoyee").length;
    const late = invoices.filter((i) => i.status === "en_retard").length;
    return { all, paid, pending, late };
  }, [invoices]);

  const totals = useMemo(() => {
    const paid = invoices
      .filter((i) => i.status === "payee")
      .reduce((a, b) => a + b.totalCents, 0);
    const pending = invoices
      .filter((i) => i.status === "envoyee")
      .reduce((a, b) => a + b.totalCents, 0);
    const late = invoices
      .filter((i) => i.status === "en_retard")
      .reduce((a, b) => a + b.totalCents, 0);
    return { paid, pending, late, all: paid + pending + late };
  }, [invoices]);

  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; rev: number }>();
    for (const inv of invoices) {
      if (inv.status !== "payee") continue;
      const name = inv.companyName ?? inv.companyId;
      const cur = map.get(name) ?? { name, rev: 0 };
      cur.rev += inv.totalCents;
      map.set(name, cur);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b.rev, 0) || 1;
    return Array.from(map.values())
      .sort((a, b) => b.rev - a.rev)
      .slice(0, 5)
      .map((c) => ({
        ...c,
        share: Math.round((c.rev / total) * 100),
      }));
  }, [invoices]);

  const overdueInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "envoyee" || i.status === "en_retard")
        .sort(
          (a, b) =>
            new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
        )
        .slice(0, 5),
    [invoices],
  );

  const topCommissions = useMemo(
    () =>
      [...commissions]
        .filter((c) => c.status === "pending")
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 5),
    [commissions],
  );

  const expensesMonth = useMemo(() => {
    if (!kpis) return 0;
    return kpis.expensesMonthCents;
  }, [kpis]);

  if (loading) {
    return (
      <div className="glass-page">
        <div style={{ padding: 32, color: "var(--gray-500)" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Finances
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Revenus, encaissements, commissions — vue consolidée.
          </p>
        </div>
      </div>

      <div className="glass-kpigrid" style={{ marginBottom: 20 }}>
        {[
          { l: "MRR", v: fmtEur(kpis?.mrrCents ?? 0), s: "Encaissé ce mois", up: true },
          {
            l: "Encaissé",
            v: fmtEur(kpis?.collectedCents ?? 0),
            s: `${kpis?.collectedCount ?? 0} factures payées`,
            up: true,
          },
          {
            l: "En attente",
            v: fmtEur(kpis?.pendingCents ?? 0),
            s: `${kpis?.pendingCount ?? 0} factures · ${kpis?.overdueCount ?? 0} en retard`,
            up: false,
          },
          {
            l: "Commissions",
            v: fmtEur(kpis?.commissionsDueCents ?? 0),
            s: `${kpis?.commissionsDueCount ?? 0} chauffeurs en attente`,
            up: true,
          },
        ].map((k) => (
          <div key={k.l} className="glass-kpi">
            <div className="label">{k.l}</div>
            <div className="value">{k.v}</div>
            <div className="sub">
              <span className={k.up ? "trend-up" : "trend-down"}>
                <Icon name={k.up ? "trending-up" : "trending-down"} size={12} />{" "}
              </span>
              {k.s}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>Revenus — 30 jours</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--gray-500)",
                }}
              >
                Flocage + Borne cumulés
              </p>
            </div>
          </div>
          <StackedArea />
          <div className="glass-stat-grid">
            <div className="glass-stat">
              <div className="stat-label">Encaissé (mois)</div>
              <div className="stat-val">{fmtEur(totals.paid)}</div>
              <div className="stat-sub">
                <span className="up">{counts.paid} factures</span>
              </div>
            </div>
            <div className="glass-stat">
              <div className="stat-label">En attente</div>
              <div className="stat-val">{fmtEur(totals.pending + totals.late)}</div>
              <div className="stat-sub">
                <span>{counts.pending + counts.late} factures</span>
              </div>
            </div>
            <div className="glass-stat">
              <div className="stat-label">Dépenses (mois)</div>
              <div className="stat-val">{fmtEur(expensesMonth)}</div>
              <div className="stat-sub">
                <span>{kpis?.expensesMonthCount ?? 0} entrées</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Top clients</h3>
            <span style={{ fontSize: 12, color: "var(--gray-500)" }}>Part du CA</span>
          </div>
          {topClients.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
              Aucune facture payée pour l’instant.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topClients.map((t) => {
                const color = colorFor(t.name);
                return (
                  <div key={t.name}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 6,
                      }}
                    >
                      <div
                        className="brand-logo"
                        style={{
                          background: color,
                          width: 30,
                          height: 30,
                          fontSize: 11,
                        }}
                      >
                        {initialsFor(t.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.name}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {fmtEur(t.rev)}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        paddingLeft: 40,
                      }}
                    >
                      <div className="glass-progress" style={{ flex: 1, height: 6 }}>
                        <span style={{ width: t.share + "%" }} />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--gray-500)",
                          fontWeight: 600,
                          minWidth: 36,
                          textAlign: "right",
                        }}
                      >
                        {t.share} %
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>Factures récentes</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--gray-500)",
                }}
              >
                {filteredInvoices.length} factures ·{" "}
                {fmtEur(
                  filteredInvoices.reduce((a, b) => a + b.totalCents, 0),
                )}
              </p>
            </div>
            <div className="glass-segmented">
              {(
                [
                  ["all", `Toutes · ${counts.all}`],
                  ["paid", `Payées · ${counts.paid}`],
                  ["pending", `En cours · ${counts.pending}`],
                  ["late", `En retard · ${counts.late}`],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  className={statusFilter === k ? "active" : ""}
                  onClick={() => setStatusFilter(k)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <div
              style={{
                padding: 32,
                color: "var(--gray-500)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              Aucune facture dans cette catégorie.
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th style={{ textAlign: "right" }}>Montant</th>
                  <th style={{ textAlign: "right" }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const name = inv.companyName ?? inv.companyId;
                  return (
                    <tr key={inv.id}>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: 12,
                          }}
                        >
                          {inv.ref}
                        </span>
                      </td>
                      <td>
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <div
                            className="brand-logo"
                            style={{
                              background: colorFor(name),
                              width: 26,
                              height: 26,
                              fontSize: 10,
                            }}
                          >
                            {initialsFor(name)}
                          </div>
                          <span>{name}</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--gray-500)" }}>
                        {fmtDate(inv.issueDate)}
                      </td>
                      <td>
                        <span
                          className={
                            "g-chip " +
                            (inv.status === "payee"
                              ? "success"
                              : inv.status === "envoyee"
                                ? "info"
                                : inv.status === "en_retard"
                                  ? "danger"
                                  : "")
                          }
                        >
                          <span className="dot" />
                          {STATUS_LABEL[inv.status]}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>
                        {fmtEur(inv.totalCents)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <a
                          className="glass-btn ghost compact"
                          href={`/api/admin/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Télécharger"
                        >
                          <Icon name="download" size={13} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid rgba(0,0,0,0.06)",
              fontSize: 12,
              color: "var(--gray-500)",
            }}
          >
            <span>
              Total{" "}
              {statusFilter === "all"
                ? "toutes factures"
                : statusFilter === "paid"
                  ? "payées"
                  : statusFilter === "pending"
                    ? "en cours"
                    : "en retard"}
            </span>
            <strong style={{ color: "var(--black)" }}>
              {fmtEur(filteredInvoices.reduce((a, b) => a + b.totalCents, 0))}
            </strong>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Échéances à venir</h3>
            <span className="g-chip outline">
              <Icon name="calendar" size={11} /> {overdueInvoices.length} factures
            </span>
          </div>
          {overdueInvoices.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
              Aucune échéance ouverte.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {overdueInvoices.map((u) => {
                const isLate = u.status === "en_retard";
                return (
                  <div
                    key={u.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: "var(--navy-soft)",
                      borderRadius: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.85)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isLate ? "var(--danger)" : "var(--navy)",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={isLate ? "alert-triangle" : "clock"} size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {u.companyName ?? u.companyId}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--gray-500)",
                          marginTop: 2,
                        }}
                      >
                        {u.ref} · échéance {fmtDate(u.dueDate)}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {fmtEur(u.totalCents)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Dépenses récentes</h3>
            <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
              {expenses.length} entrées
            </span>
          </div>
          {expenses.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
              Aucune dépense enregistrée.
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Catégorie</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 5).map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{e.label}</span>
                    </td>
                    <td style={{ color: "var(--gray-500)" }}>
                      {EXPENSE_CATEGORY_LABELS[e.category]}
                    </td>
                    <td style={{ color: "var(--gray-500)" }}>
                      {fmtDate(e.expenseDate)}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {fmtEur(e.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="glass-panel" style={{ padding: 20 }}>
          <div className="glass-panelhead" style={{ padding: 0, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14 }}>Commissions chauffeurs</h3>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "var(--gray-500)",
                }}
              >
                Top 5 en attente ·{" "}
                {fmtEur(topCommissions.reduce((a, b) => a + b.amountCents, 0))}
              </p>
            </div>
          </div>
          {topCommissions.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
              Aucune commission en attente.
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Chauffeur</th>
                  <th>Campagne</th>
                  <th style={{ textAlign: "right" }}>Km</th>
                  <th style={{ textAlign: "right" }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {topCommissions.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <div
                          className="brand-logo"
                          style={{
                            background: "var(--navy)",
                            color: "#fff",
                            width: 28,
                            height: 28,
                            fontSize: 10,
                          }}
                        >
                          {initialsFor(c.driverName)}
                        </div>
                        <span style={{ fontWeight: 600 }}>{c.driverName}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--gray-500)", fontSize: 12 }}>
                      {c.campaignBrand ?? c.campaignTitle ?? "—"}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--gray-600)" }}>
                      {c.km.toLocaleString("fr-FR")}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {fmtEur(c.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div
        className="glass-panel"
        style={{
          padding: "18px 24px",
          marginTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          {[
            { l: "Total facturé", v: fmtEur(totals.all), c: undefined },
            { l: "Payé", v: fmtEur(totals.paid), c: "var(--success)" },
            { l: "En cours", v: fmtEur(totals.pending), c: "var(--info)" },
            { l: "En retard", v: fmtEur(totals.late), c: "var(--danger)" },
          ].map((s) => (
            <div key={s.l}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--gray-500)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 22,
                  fontWeight: 700,
                  color: s.c,
                }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
