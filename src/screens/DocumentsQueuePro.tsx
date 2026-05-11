"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type DocumentStatus = "pending" | "approved" | "rejected";

type AdminDocFile = {
  publicId: string;
  url: string;
  resourceType: "image" | "raw" | "video";
  format?: string;
  bytes: number;
  uploadedAt: string;
};

type AdminDoc = {
  id: string;
  driverId: string;
  driverName: string;
  driverCity: string;
  type: string;
  typeLabel: string;
  status: DocumentStatus;
  files: AdminDocFile[];
  rejectReason?: string;
  reviewedAt?: string;
  updatedAt: string;
  createdAt: string;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

export function DocumentsQueuePro() {
  const [filter, setFilter] = useState<DocumentStatus>("pending");
  const [rows, setRows] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<AdminDoc | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents?status=${filter}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { documents: AdminDoc[] };
      setRows(body.documents);
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
    setOpenDoc(null);
    setDecision(null);
    setReason("");
  };

  const submit = async () => {
    if (!openDoc || !decision) return;
    if (decision === "rejected" && !reason.trim()) {
      alert("Motif requis");
      return;
    }
    setSubmitting(true);
    try {
      const path =
        decision === "approved"
          ? `/api/admin/documents/${openDoc.id}/approve`
          : `/api/admin/documents/${openDoc.id}/reject`;
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          decision === "rejected" ? { reason } : {},
        ),
      });
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
          <h1>Documents</h1>
          <p className="subtitle">
            File d&apos;attente de validation des documents chauffeurs.
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

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(
          [
            ["pending", "À valider"],
            ["approved", "Approuvés"],
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
              <th>Type</th>
              <th>Fichiers</th>
              <th>Reçu</th>
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
                <td
                  colSpan={7}
                  style={{ textAlign: "center", padding: 24, color: "var(--gray-500)" }}
                >
                  Aucun document {filter === "pending" ? "en attente" : filter === "approved" ? "approuvé" : "rejeté"}.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.driverName}</strong>
                  </td>
                  <td>{r.driverCity}</td>
                  <td>{r.typeLabel}</td>
                  <td>{r.files.length}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {fmtDate(r.updatedAt)}
                  </td>
                  <td>
                    <span
                      className="chip chip-outline"
                      style={
                        r.status === "approved"
                          ? {
                              background: "#DCFCE7",
                              color: "#166534",
                              borderColor: "#86EFAC",
                            }
                          : r.status === "rejected"
                            ? {
                                background: "#FEE2E2",
                                color: "#991B1B",
                                borderColor: "#FCA5A5",
                              }
                            : undefined
                      }
                    >
                      {r.status === "pending"
                        ? "À valider"
                        : r.status === "approved"
                          ? "Approuvé"
                          : "Rejeté"}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setOpenDoc(r)}
                    >
                      <Icon name="eye" size={12} /> Examiner
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Review modal */}
      {openDoc && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              width: 720,
              maxWidth: "100%",
              maxHeight: "90vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
              }}
            >
              <div>
                <h3 style={{ marginBottom: 2 }}>
                  {openDoc.typeLabel} — {openDoc.driverName}
                </h3>
                <p style={{ fontSize: 12, color: "var(--gray-500)" }}>
                  {openDoc.driverCity} · Reçu {fmtDate(openDoc.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeModal}
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            {openDoc.rejectReason && (
              <div
                style={{
                  padding: 12,
                  background: "#FEE2E2",
                  color: "#991B1B",
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                <strong>Motif précédent :</strong> {openDoc.rejectReason}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              {openDoc.files.map((f, i) => (
                <a
                  key={f.publicId}
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    border: "1px solid var(--gray-200)",
                    borderRadius: 8,
                    overflow: "hidden",
                    background: "var(--gray-50)",
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  {f.resourceType === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={f.url}
                      alt={`${openDoc.typeLabel} ${i + 1}`}
                      style={{
                        width: "100%",
                        height: 160,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        height: 160,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <Icon name="file-text" size={32} />
                      <span style={{ fontSize: 11 }}>
                        {f.format?.toUpperCase() ?? "FILE"}
                      </span>
                    </div>
                  )}
                  <div style={{ padding: 8, fontSize: 11 }}>
                    Fichier {i + 1} · {fmtSize(f.bytes)}
                  </div>
                </a>
              ))}
            </div>

            {decision === "rejected" ? (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>
                  Motif du rejet (requis)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Photo floue, document expiré, etc."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid var(--gray-200)",
                    borderRadius: 6,
                    resize: "vertical",
                  }}
                />
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              {decision ? (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setDecision(null)}
                    disabled={submitting}
                  >
                    Retour
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submit}
                    disabled={submitting}
                  >
                    {submitting ? "Envoi…" : "Confirmer"}
                  </button>
                </>
              ) : openDoc.status === "pending" ? (
                <>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setDecision("rejected")}
                  >
                    Rejeter
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setDecision("approved")}
                  >
                    Approuver
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeModal}
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
