"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type WithdrawalStatus = "pending" | "paid" | "rejected";

type WithdrawalRow = {
  id: string;
  driverId: string;
  driverName: string;
  driverCity: string;
  amountCents: number;
  status: WithdrawalStatus;
  iban: string;
  bankName?: string;
  accountHolder?: string;
  createdAt: string;
  processedAt?: string;
  payoutReference?: string;
  rejectReason?: string;
};

const eur = (cents: number) =>
  `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function WithdrawalsQueuePro() {
  const [filter, setFilter] = useState<WithdrawalStatus>("pending");
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionRow, setActionRow] = useState<WithdrawalRow | null>(null);
  const [decision, setDecision] = useState<"paid" | "rejected" | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/withdrawals?status=${filter}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { withdrawals: WithdrawalRow[] };
      setRows(body.withdrawals);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const closeModal = () => {
    setActionRow(null);
    setDecision(null);
    setReference("");
    setReason("");
  };

  const submit = async () => {
    if (!actionRow || !decision) return;
    if (decision === "rejected" && !reason.trim()) {
      alert("Motif requis");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/withdrawals/${actionRow.id}/process`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            payoutReference: reference || undefined,
            rejectReason: reason || undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      closeModal();
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Retraits</h1>
          <p className="subtitle">
            File d&apos;attente des demandes de retrait des chauffeurs.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={load}
          disabled={loading}
        >
          <Icon name="refresh" size={16} /> Actualiser
        </button>
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(
          [
            ["pending", "En attente"],
            ["paid", "Payés"],
            ["rejected", "Rejetés"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={
              "chip " + (filter === k ? "chip-filled-navy" : "chip-outline")
            }
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#FEE2E2",
            color: "#991B1B",
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      <div className="card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>Chauffeur</th>
              <th>Ville</th>
              <th>IBAN</th>
              <th>Demandé</th>
              <th style={{ textAlign: "right" }}>Montant</th>
              <th>Statut</th>
              <th style={{ width: 200 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24 }}>
                  Chargement…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--gray-500)" }}>
                  Aucune demande {filter === "pending" ? "en attente" : filter === "paid" ? "payée" : "rejetée"}.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.driverName}</strong>
                  </td>
                  <td>{r.driverCity}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {r.iban.replace(/(.{4})/g, "$1 ").trim()}
                    {r.bankName && (
                      <div style={{ color: "var(--gray-500)", fontSize: 11 }}>
                        {r.bankName}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {fmt(r.createdAt)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {eur(r.amountCents)}
                  </td>
                  <td>
                    <span
                      className={
                        "chip " +
                        (r.status === "pending"
                          ? "chip-outline"
                          : r.status === "paid"
                            ? "chip-filled-navy"
                            : "chip-outline")
                      }
                      style={
                        r.status === "rejected"
                          ? {
                              background: "#FEE2E2",
                              color: "#991B1B",
                              borderColor: "#FCA5A5",
                            }
                          : undefined
                      }
                    >
                      {r.status === "pending"
                        ? "En attente"
                        : r.status === "paid"
                          ? "Payé"
                          : "Rejeté"}
                    </span>
                  </td>
                  <td>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => {
                            setActionRow(r);
                            setDecision("paid");
                          }}
                        >
                          Marquer payé
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => {
                            setActionRow(r);
                            setDecision("rejected");
                          }}
                        >
                          Rejeter
                        </button>
                      </div>
                    ) : r.status === "paid" && r.payoutReference ? (
                      <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                        Réf. {r.payoutReference}
                      </span>
                    ) : r.status === "rejected" && r.rejectReason ? (
                      <span style={{ fontSize: 11, color: "var(--gray-500)" }}>
                        {r.rejectReason}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Decision modal */}
      {actionRow && decision && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              width: 480,
              maxWidth: "90vw",
            }}
          >
            <h3 style={{ marginBottom: 4 }}>
              {decision === "paid" ? "Marquer comme payé" : "Rejeter la demande"}
            </h3>
            <p style={{ color: "var(--gray-500)", fontSize: 13, marginBottom: 16 }}>
              {actionRow.driverName} · {eur(actionRow.amountCents)} ·{" "}
              {actionRow.iban.replace(/(.{4})/g, "$1 ").trim()}
            </p>

            {decision === "paid" ? (
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Référence virement (optionnel)
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="REF-2026-04-001"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--gray-200)",
                    borderRadius: 6,
                  }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Motif du rejet (requis)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="IBAN incorrect, fraude suspectée, etc."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--gray-200)",
                    borderRadius: 6,
                    resize: "vertical",
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
                  Le rejet rembourse automatiquement le solde du chauffeur.
                </p>
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeModal}
                disabled={submitting}
              >
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Envoi…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
