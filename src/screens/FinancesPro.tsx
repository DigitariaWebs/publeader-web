"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { StackedArea } from "@/components/charts";
import type { ExpenseDTO, InvoiceDTO } from "@/lib/finance-serializer";
import type { CommissionRow } from "@/lib/commission-service";
import type { FinanceKpiDTO } from "@/lib/finance-kpi-service";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "@/lib/schemas";

type Tab = "factures" | "commissions" | "depenses";

type CompanyOption = { id: string; name: string };

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + " €";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const STATUS_LABEL: Record<InvoiceDTO["status"], string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
};

const STATUS_CHIP: Record<InvoiceDTO["status"], string> = {
  brouillon: "chip-neutral",
  envoyee: "chip-info",
  payee: "chip-success",
  en_retard: "chip-danger",
};

export function FinancesPro() {
  const [tab, setTab] = useState<Tab>("factures");
  const [kpis, setKpis] = useState<FinanceKpiDTO | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [viewing, setViewing] = useState<InvoiceDTO | null>(null);
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const sendInvoice = async (id: string) => {
    setBusyId(id);
    const res = await fetch(`/api/admin/invoices/${id}/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      alert(body?.message ?? body?.error ?? "Envoi impossible");
      return;
    }
    await reload();
  };

  const markPaid = async (id: string) => {
    const ref = window.prompt("Référence du paiement (optionnel)") ?? "";
    setBusyId(id);
    const res = await fetch(`/api/admin/invoices/${id}/mark-paid`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paidReference: ref || undefined }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      alert(body?.message ?? "Action impossible");
      return;
    }
    await reload();
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm("Supprimer ce brouillon ?")) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/invoices/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusyId(null);
    if (!res.ok) {
      alert("Suppression impossible");
      return;
    }
    await reload();
  };

  const settleCommission = async (txId: string) => {
    setBusyId(txId);
    const res = await fetch(`/api/admin/commissions/settle`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: [txId] }),
    });
    setBusyId(null);
    if (!res.ok) {
      alert("Règlement impossible");
      return;
    }
    await reload();
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Supprimer cette dépense ?")) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/expenses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusyId(null);
    if (!res.ok) {
      alert("Suppression impossible");
      return;
    }
    await reload();
  };

  const kpiCards = useMemo(
    () => [
      {
        l: "MRR",
        v: kpis ? fmtEur(kpis.mrrCents) : "—",
        s: "Encaissé ce mois",
      },
      {
        l: "Encaissé (mois)",
        v: kpis ? fmtEur(kpis.collectedCents) : "—",
        s: kpis ? `${kpis.collectedCount} factures payées` : "",
      },
      {
        l: "En attente",
        v: kpis ? fmtEur(kpis.pendingCents) : "—",
        s: kpis
          ? `${kpis.pendingCount} factures · ${kpis.overdueCount} en retard`
          : "",
      },
      {
        l: "Commissions dues",
        v: kpis ? fmtEur(kpis.commissionsDueCents) : "—",
        s: kpis ? `${kpis.commissionsDueCount} chauffeurs` : "",
      },
    ],
    [kpis],
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Finances</h1>
          <p className="subtitle">
            Factures, commissions chauffeurs, dépenses opérationnelles.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "depenses" ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreatingExpense(true)}
            >
              <Icon name="plus" size={18} /> Nouvelle dépense
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreatingInvoice(true)}
            >
              <Icon name="plus" size={18} /> Nouvelle facture
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-12 mb-6" style={{ gap: 16 }}>
        {kpiCards.map((t) => (
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
            <div style={{ fontSize: 12, color: "var(--gray-500)" }}>{t.s}</div>
          </div>
        ))}
      </div>

      <div className="card mb-6" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: 14, margin: 0 }}>
            Revenus par produit — 30 derniers jours
          </h3>
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "#233466",
                  borderRadius: 2,
                  marginRight: 6,
                }}
              />
              Flocage
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  background: "#3B82F6",
                  borderRadius: 2,
                  marginRight: 6,
                }}
              />
              Leader Borne
            </span>
          </div>
        </div>
        <StackedArea />
      </div>

      <div className="tabs">
        {(
          [
            ["factures", `Factures · ${invoices.length}`],
            ["commissions", `Commissions · ${commissions.length}`],
            ["depenses", `Dépenses · ${expenses.length}`],
          ] as const
        ).map(([k, l]) => (
          <div
            key={k}
            className={"tab" + (tab === k ? " active" : "")}
            onClick={() => setTab(k as Tab)}
          >
            {l}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 32, color: "var(--gray-500)" }}>Chargement…</div>
      ) : tab === "factures" ? (
        <InvoicesTable
          invoices={invoices}
          busyId={busyId}
          onView={(inv) => setViewing(inv)}
          onSend={sendInvoice}
          onMarkPaid={markPaid}
          onDelete={deleteInvoice}
        />
      ) : tab === "commissions" ? (
        <CommissionsTable
          rows={commissions}
          busyId={busyId}
          onSettle={settleCommission}
        />
      ) : (
        <ExpensesTable
          rows={expenses}
          busyId={busyId}
          onDelete={deleteExpense}
        />
      )}

      {creatingInvoice && (
        <NewInvoiceModal
          onClose={() => setCreatingInvoice(false)}
          onDone={async () => {
            setCreatingInvoice(false);
            await reload();
          }}
        />
      )}
      {viewing && (
        <ViewInvoiceModal invoice={viewing} onClose={() => setViewing(null)} />
      )}
      {creatingExpense && (
        <NewExpenseModal
          onClose={() => setCreatingExpense(false)}
          onDone={async () => {
            setCreatingExpense(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function InvoicesTable({
  invoices,
  busyId,
  onView,
  onSend,
  onMarkPaid,
  onDelete,
}: {
  invoices: InvoiceDTO[];
  busyId: string | null;
  onView: (inv: InvoiceDTO) => void;
  onSend: (id: string) => Promise<void>;
  onMarkPaid: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (invoices.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}
      >
        <Icon name="file-text" size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>
          Aucune facture pour l’instant.
        </p>
      </div>
    );
  }
  return (
    <div className="card card-flush">
      <table className="table">
        <thead>
          <tr>
            <th>Référence</th>
            <th>Entreprise</th>
            <th>Émise</th>
            <th>Échéance</th>
            <th style={{ textAlign: "right" }}>Montant</th>
            <th>Statut</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.ref}</td>
              <td>{r.companyName ?? r.companyId}</td>
              <td style={{ color: "var(--gray-500)" }}>{fmtDate(r.issueDate)}</td>
              <td style={{ color: "var(--gray-500)" }}>{fmtDate(r.dueDate)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {fmtEur(r.totalCents)}
              </td>
              <td>
                <span className={"chip " + STATUS_CHIP[r.status]}>
                  <span className="dot" /> {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                <div style={{ display: "inline-flex", gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost compact"
                    onClick={() => onView(r)}
                  >
                    Voir
                  </button>
                  <a
                    className="btn btn-ghost compact"
                    href={`/api/admin/invoices/${r.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>
                  {r.storedStatus === "brouillon" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary compact"
                        disabled={busyId === r.id}
                        onClick={() => onSend(r.id)}
                      >
                        Envoyer
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost compact"
                        disabled={busyId === r.id}
                        onClick={() => onDelete(r.id)}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                  {(r.storedStatus === "envoyee" ||
                    r.storedStatus === "brouillon") && (
                    <button
                      type="button"
                      className="btn btn-primary compact"
                      disabled={busyId === r.id}
                      onClick={() => onMarkPaid(r.id)}
                    >
                      Marquer payée
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsTable({
  rows,
  busyId,
  onSettle,
}: {
  rows: CommissionRow[];
  busyId: string | null;
  onSettle: (id: string) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}
      >
        <Icon name="users" size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>
          Aucune commission enregistrée.
        </p>
      </div>
    );
  }
  return (
    <div className="card card-flush">
      <table className="table">
        <thead>
          <tr>
            <th>Chauffeur</th>
            <th>Campagne</th>
            <th style={{ textAlign: "right" }}>Km</th>
            <th style={{ textAlign: "right" }}>Montant</th>
            <th>Statut</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.driverName}</td>
              <td>
                {r.campaignBrand
                  ? `${r.campaignBrand} — ${r.campaignTitle ?? ""}`
                  : (r.campaignTitle ?? r.campaignId ?? "—")}
              </td>
              <td style={{ textAlign: "right" }}>
                {r.km.toLocaleString("fr-FR")}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {fmtEur(r.amountCents)}
              </td>
              <td>
                <span
                  className={
                    "chip " +
                    (r.status === "available" ? "chip-success" : "chip-warning")
                  }
                >
                  <span className="dot" />
                  {r.status === "available" ? "Payé" : "À payer"}
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                {r.status === "pending" ? (
                  <button
                    type="button"
                    className="btn btn-primary compact"
                    disabled={busyId === r.id}
                    onClick={() => onSettle(r.id)}
                  >
                    Régler
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {fmtDate(r.availableAt)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesTable({
  rows,
  busyId,
  onDelete,
}: {
  rows: ExpenseDTO[];
  busyId: string | null;
  onDelete: (id: string) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="card"
        style={{ padding: 48, textAlign: "center", color: "var(--gray-500)" }}
      >
        <Icon name="credit-card" size={32} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>
          Aucune dépense enregistrée.
        </p>
      </div>
    );
  }
  return (
    <div className="card card-flush">
      <table className="table">
        <thead>
          <tr>
            <th>Libellé</th>
            <th>Catégorie</th>
            <th>Date</th>
            <th>Fournisseur</th>
            <th style={{ textAlign: "right" }}>Montant</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.label}</td>
              <td>{EXPENSE_CATEGORY_LABELS[r.category]}</td>
              <td style={{ color: "var(--gray-500)" }}>
                {fmtDate(r.expenseDate)}
              </td>
              <td style={{ color: "var(--gray-500)" }}>{r.vendor ?? "—"}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {fmtEur(r.amountCents)}
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-ghost compact"
                  disabled={busyId === r.id}
                  onClick={() => onDelete(r.id)}
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LineDraft = { label: string; qty: string; unitCents: string };

function NewInvoiceModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  );
  const [lines, setLines] = useState<LineDraft[]>([
    { label: "", qty: "1", unitCents: "" },
  ]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/companies", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { companies: CompanyOption[] }) => {
        setCompanies(data.companies ?? []);
      });
  }, []);

  const subtotalCents = lines.reduce((a, l) => {
    const qty = Number(l.qty) || 0;
    const unit = Math.round(Number(l.unitCents) * 100) || 0;
    return a + qty * unit;
  }, 0);
  const taxCents = Math.round(subtotalCents * 0.2);
  const totalCents = subtotalCents + taxCents;

  const submit = async () => {
    setErr(null);
    if (!companyId) {
      setErr("Sélectionnez une entreprise");
      return;
    }
    const cleanLines = lines
      .filter((l) => l.label.trim())
      .map((l) => ({
        label: l.label.trim(),
        qty: Number(l.qty),
        unitCents: Math.round(Number(l.unitCents) * 100),
      }));
    if (cleanLines.length === 0) {
      setErr("Ajoutez au moins une ligne");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/admin/invoices", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        issueDate,
        dueDate,
        lines: cleanLines,
        notes: notes.trim() || undefined,
      }),
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
      <div className="sheet" style={{ width: 640 }}>
        <div className="sheet-head">
          <h2>Nouvelle facture</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body" style={{ display: "grid", gap: 16 }}>
          <Field label="Entreprise">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— sélectionner —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Émise le">
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Échéance">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Lignes</span>
              <button
                type="button"
                className="btn btn-ghost compact"
                onClick={() =>
                  setLines((l) => [
                    ...l,
                    { label: "", qty: "1", unitCents: "" },
                  ])
                }
              >
                <Icon name="plus" size={14} /> Ajouter
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 110px 30px",
                    gap: 8,
                  }}
                >
                  <input
                    placeholder="Description"
                    value={l.label}
                    onChange={(e) =>
                      setLines((arr) =>
                        arr.map((x, idx) =>
                          idx === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    style={inputStyle}
                  />
                  <input
                    placeholder="Qté"
                    value={l.qty}
                    onChange={(e) =>
                      setLines((arr) =>
                        arr.map((x, idx) =>
                          idx === i ? { ...x, qty: e.target.value } : x,
                        ),
                      )
                    }
                    style={inputStyle}
                  />
                  <input
                    placeholder="PU HT (€)"
                    value={l.unitCents}
                    onChange={(e) =>
                      setLines((arr) =>
                        arr.map((x, idx) =>
                          idx === i ? { ...x, unitCents: e.target.value } : x,
                        ),
                      )
                    }
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((arr) => arr.filter((_, idx) => idx !== i))
                    }
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>

          <div
            style={{
              borderTop: "1px solid var(--gray-200)",
              paddingTop: 12,
              display: "grid",
              gap: 4,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Sous-total HT</span>
              <span>{fmtEur(subtotalCents)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--gray-500)",
              }}
            >
              <span>TVA 20 %</span>
              <span>{fmtEur(taxCents)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              <span>Total TTC</span>
              <span>{fmtEur(totalCents)}</span>
            </div>
          </div>

          {err && (
            <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>
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
            {submitting ? "Création…" : "Créer brouillon"}
          </button>
        </div>
      </div>
    </>
  );
}

function ViewInvoiceModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDTO;
  onClose: () => void;
}) {
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" style={{ width: 600 }}>
        <div className="sheet-head">
          <h2>{invoice.ref}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body" style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <KV label="Entreprise" value={invoice.companyName ?? invoice.companyId} />
            <KV label="Statut" value={STATUS_LABEL[invoice.status]} />
            <KV label="Émise" value={fmtDate(invoice.issueDate)} />
            <KV label="Échéance" value={fmtDate(invoice.dueDate)} />
            {invoice.sentAt && (
              <KV
                label="Envoyée"
                value={`${fmtDate(invoice.sentAt)}${invoice.sentTo ? ` → ${invoice.sentTo}` : ""}`}
              />
            )}
            {invoice.paidAt && (
              <KV
                label="Payée"
                value={`${fmtDate(invoice.paidAt)}${invoice.paidReference ? ` · ${invoice.paidReference}` : ""}`}
              />
            )}
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: "right" }}>Qté</th>
                <th style={{ textAlign: "right" }}>PU HT</th>
                <th style={{ textAlign: "right" }}>Total HT</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.label}</td>
                  <td style={{ textAlign: "right" }}>{l.qty}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(l.unitCents)}</td>
                  <td style={{ textAlign: "right" }}>{fmtEur(l.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              borderTop: "1px solid var(--gray-200)",
              paddingTop: 12,
              display: "grid",
              gap: 4,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Sous-total HT</span>
              <span>{fmtEur(invoice.subtotalCents)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--gray-500)",
              }}
            >
              <span>TVA</span>
              <span>{fmtEur(invoice.taxCents)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
              }}
            >
              <span>Total TTC</span>
              <span>{fmtEur(invoice.totalCents)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div style={{ fontSize: 13 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--gray-500)",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Notes
              </div>
              {invoice.notes}
            </div>
          )}
        </div>
        <div className="sheet-footer">
          <a
            className="btn btn-ghost"
            href={`/api/admin/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="download" size={16} /> PDF
          </a>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </>
  );
}

function NewExpenseModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("fourniture");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!label.trim()) {
      setErr("Libellé requis");
      return;
    }
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr("Montant invalide");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/admin/expenses", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        category,
        amountCents: cents,
        vendor: vendor.trim() || undefined,
        expenseDate: date,
        notes: notes.trim() || undefined,
      }),
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
      <div className="sheet" style={{ width: 480 }}>
        <div className="sheet-head">
          <h2>Nouvelle dépense</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body" style={{ display: "grid", gap: 14 }}>
          <Field label="Libellé">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Catégorie">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                style={inputStyle}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Montant TTC (€)">
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Fournisseur">
              <input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
          {err && (
            <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--gray-600)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--gray-500)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--gray-200)",
  fontSize: 13,
  fontFamily: "inherit",
};
