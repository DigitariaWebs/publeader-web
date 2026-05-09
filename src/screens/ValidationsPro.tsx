"use client";

/**
 * ValidationsPro — admin validations queue (AD1).
 * Wired to /api/admin/validations. Three kinds: drivers, companies, partners.
 * Approve / reject (preset reason + optional note) / request more info.
 */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/contexts/ToastContext";
import {
  VALIDATION_REJECT_REASONS,
  VALIDATION_REJECT_REASON_LABELS,
  type ValidationKind,
  type ValidationRejectReason,
  type ValidationStatus,
} from "@/lib/schemas";

type QueueItem = {
  id: string;
  kind: ValidationKind;
  name: string;
  email: string;
  city?: string;
  status: ValidationStatus;
  submittedAt: string;
  reviewedAt?: string;
  summary?: {
    docsCompleted?: number;
    docsRequired?: number;
    documentsApproved?: boolean;
    sector?: string;
    legalForm?: string;
    venueAddress?: string;
  };
};

type Counts = {
  pending: number;
  drivers: number;
  companies: number;
  partners: number;
};

type Detail = {
  id: string;
  kind: ValidationKind;
  status: ValidationStatus;
  user: { id: string; email: string; name?: string };
  submittedAt: string;
  validation?: {
    reviewedBy?: string;
    reviewedAt?: string;
    rejection?: { reason: ValidationRejectReason; note?: string };
    lastInfoRequest?: { message: string; requestedBy: string; requestedAt: string };
  };
  driver?: {
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    documentsApproved: boolean;
    documents: Array<{
      id: string;
      type: string;
      typeLabel: string;
      status: string;
      files: Array<{ url: string; resourceType: string; uploadedAt: string }>;
      rejectReason?: string;
    }>;
  };
  company?: {
    companyName: string;
    contactName: string;
    phone: string;
    domain: string;
    sector: string;
    city: string;
    legalName?: string;
    siret?: string;
    vatNumber?: string;
    legalForm?: string;
    website?: string;
    description?: string;
    logoUrl?: string;
  };
  partner?: {
    businessName: string;
    managerName: string;
    phone: string;
    address: string;
    city: string;
    openingHours?: string;
  };
};

const KIND_LABEL: Record<ValidationKind, string> = {
  driver: "Chauffeur",
  company: "Entreprise",
  partner: "Partenaire",
};

const STATUS_LABEL: Record<ValidationStatus, string> = {
  pending: "En attente",
  validated: "Validé",
  rejected: "Refusé",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

interface RejectModalProps {
  item: QueueItem | Detail;
  onClose: () => void;
  onSubmit: (reason: ValidationRejectReason, note: string) => Promise<void>;
}

function RejectModal({ item, onClose, onSubmit }: RejectModalProps) {
  const [reason, setReason] = useState<ValidationRejectReason>(
    "incomplete_documents",
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const name = "name" in item ? item.name : "";

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-header">
          <h3>Refuser ce dossier</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: "0 0 16px", color: "var(--gray-600)" }}>
            Vous êtes sur le point de refuser <strong>{name}</strong>. L&apos;utilisateur
            recevra une notification par email.
          </p>
          <div className="input-group">
            <label className="input-label">Motif de refus</label>
            <select
              className="select"
              value={reason}
              onChange={(e) => setReason(e.target.value as ValidationRejectReason)}
            >
              {VALIDATION_REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {VALIDATION_REJECT_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Note (optionnel)</label>
            <textarea
              className="textarea"
              placeholder="Précisez pour l'équipe…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(reason, note);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmer le refus
          </button>
        </div>
      </div>
    </>
  );
}

interface InfoRequestModalProps {
  item: QueueItem | Detail;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
}

function InfoRequestModal({ item, onClose, onSubmit }: InfoRequestModalProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const name = "name" in item ? item.name : "";

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="modal">
        <div className="modal-header">
          <h3>Demander des informations</h3>
        </div>
        <div className="modal-body">
          <p style={{ margin: "0 0 16px", color: "var(--gray-600)" }}>
            Envoyer un message à <strong>{name}</strong> pour obtenir des précisions. Le
            dossier reste en attente.
          </p>
          <div className="input-group">
            <label className="input-label">Message</label>
            <textarea
              className="textarea"
              placeholder="Précisez ce qui manque ou doit être corrigé…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !message.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(message.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            Envoyer la demande
          </button>
        </div>
      </div>
    </>
  );
}

interface DetailSheetProps {
  itemId: string;
  kind: ValidationKind;
  onClose: () => void;
  onChange: () => void;
}

function DetailSheet({ itemId, kind, onClose, onChange }: DetailSheetProps) {
  const { pushToast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"profile" | "docs" | "history">("profile");
  const [reject, setReject] = useState(false);
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/validations/${kind}/${itemId}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as { detail?: Detail; error?: string };
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setDetail(data.detail!);
    } catch (e) {
      pushToast({
        kind: "danger",
        title: "Erreur",
        desc: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, kind]);

  const canApprove =
    detail &&
    detail.status === "pending" &&
    (kind !== "driver" || !!detail.driver?.documentsApproved);

  const onApprove = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/validations/${kind}/${itemId}/approve`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json()) as { error?: string; code?: string };
      if (!res.ok) throw new Error(data.error ?? "approve failed");
      pushToast({
        kind: "success",
        title: "Dossier validé",
        desc: detail.user.email + " a été notifié.",
      });
      onChange();
      reload();
    } catch (e) {
      pushToast({
        kind: "danger",
        title: "Erreur",
        desc: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const onReject = async (reason: ValidationRejectReason, note: string) => {
    const res = await fetch(
      `/api/admin/validations/${kind}/${itemId}/reject`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note || undefined }),
      },
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      pushToast({
        kind: "danger",
        title: "Erreur",
        desc: data.error ?? "rejet impossible",
      });
      return;
    }
    pushToast({
      kind: "danger",
      title: "Dossier refusé",
      desc: "L'utilisateur a été notifié.",
    });
    setReject(false);
    onChange();
    reload();
  };

  const onInfo = async (message: string) => {
    const res = await fetch(
      `/api/admin/validations/${kind}/${itemId}/request-info`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      },
    );
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      pushToast({
        kind: "danger",
        title: "Erreur",
        desc: data.error ?? "envoi impossible",
      });
      return;
    }
    pushToast({
      kind: "success",
      title: "Message envoyé",
      desc: "Le demandeur a été notifié.",
    });
    setInfo(false);
    onChange();
    reload();
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-header">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              className="avatar-initials"
              style={{ width: 64, height: 64, fontSize: 22 }}
            >
              {(detail
                ? detail.kind === "driver"
                  ? `${detail.driver?.firstName ?? ""} ${detail.driver?.lastName ?? ""}`
                  : detail.kind === "company"
                    ? detail.company?.companyName
                    : detail.partner?.businessName
                : "")
                ?.split(" ")
                .map((s: string) => s[0])
                .slice(0, 2)
                .join("") || "?"}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700 }}>
                {detail
                  ? detail.kind === "driver"
                    ? `${detail.driver?.firstName ?? ""} ${detail.driver?.lastName ?? ""}`
                    : detail.kind === "company"
                      ? detail.company?.companyName
                      : detail.partner?.businessName
                  : "Chargement…"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span
                  className={
                    "chip " +
                    (detail?.status === "pending"
                      ? "chip-warning"
                      : detail?.status === "validated"
                        ? "chip-success"
                        : "chip-danger")
                  }
                >
                  <span className="dot" /> {detail ? STATUS_LABEL[detail.status] : "—"}
                </span>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                  {KIND_LABEL[kind]} · soumis{" "}
                  {detail ? timeAgo(detail.submittedAt) : ""}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ borderBottom: "1px solid var(--gray-200)", padding: "0 24px" }}>
          <div className="tabs" style={{ marginBottom: 0, border: "none" }}>
            {(
              [
                ["profile", "Profil"],
                ...(kind === "driver" ? ([["docs", "Documents"]] as const) : []),
                ["history", "Historique"],
              ] as const
            ).map(([k, l]) => (
              <div
                key={k}
                className={"tab" + (tab === k ? " active" : "")}
                onClick={() => setTab(k as "profile" | "docs" | "history")}
              >
                {l}
              </div>
            ))}
          </div>
        </div>

        <div className="sheet-body">
          {loading && <p style={{ color: "var(--gray-500)" }}>Chargement…</p>}

          {!loading && detail && tab === "profile" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {kind === "driver" && detail.driver && (
                <>
                  <Field label="Prénom" value={detail.driver.firstName} />
                  <Field label="Nom" value={detail.driver.lastName} />
                  <Field label="Téléphone" value={detail.driver.phone} />
                  <Field label="Ville" value={detail.driver.city} />
                  <Field label="Email" value={detail.user.email} />
                  <Field
                    label="Documents validés"
                    value={detail.driver.documentsApproved ? "Oui" : "Non"}
                  />
                </>
              )}
              {kind === "company" && detail.company && (
                <>
                  <Field label="Raison sociale" value={detail.company.companyName} />
                  <Field label="Contact" value={detail.company.contactName} />
                  <Field label="Téléphone" value={detail.company.phone} />
                  <Field label="Email" value={detail.user.email} />
                  <Field label="Domaine" value={detail.company.domain} />
                  <Field label="Secteur" value={detail.company.sector} />
                  <Field label="Ville" value={detail.company.city} />
                  <Field label="Forme juridique" value={detail.company.legalForm} />
                  <Field label="Nom légal" value={detail.company.legalName} />
                  <Field label="SIRET" value={detail.company.siret} />
                  <Field label="N° TVA" value={detail.company.vatNumber} />
                  <Field label="Site web" value={detail.company.website} />
                </>
              )}
              {kind === "partner" && detail.partner && (
                <>
                  <Field label="Établissement" value={detail.partner.businessName} />
                  <Field label="Gérant" value={detail.partner.managerName} />
                  <Field label="Téléphone" value={detail.partner.phone} />
                  <Field label="Email" value={detail.user.email} />
                  <Field label="Adresse" value={detail.partner.address} />
                  <Field label="Ville" value={detail.partner.city} />
                  <Field label="Horaires" value={detail.partner.openingHours} />
                </>
              )}
            </div>
          )}

          {!loading && detail && tab === "docs" && detail.driver && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {detail.driver.documents.length === 0 && (
                <div className="empty">
                  <div className="empty-icon">
                    <Icon name="file-text" size={24} />
                  </div>
                  <h3>Aucun document</h3>
                  <p>Le chauffeur n&apos;a pas encore déposé de documents.</p>
                </div>
              )}
              {detail.driver.documents.map((d) => (
                <div
                  key={d.id}
                  className="file-tile"
                  style={{ justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                    <div className="file-thumb">
                      <Icon name="file-text" size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{d.typeLabel}</div>
                      <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                        {d.files.length} fichier(s) · statut: {d.status}
                        {d.rejectReason ? ` — ${d.rejectReason}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {d.files.map((f, i) => (
                      <a
                        key={i}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost compact"
                      >
                        Voir #{i + 1}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              {!detail.driver.documentsApproved && (
                <div
                  className="alert alert-warning"
                  style={{ marginTop: 8, fontSize: 13 }}
                >
                  Tous les documents requis doivent être approuvés (via la page
                  Documents) avant que le dossier puisse être validé.
                </div>
              )}
            </div>
          )}

          {!loading && detail && tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field
                label="Soumis le"
                value={new Date(detail.submittedAt).toLocaleString("fr-FR")}
              />
              {detail.validation?.reviewedAt && (
                <Field
                  label="Dernière action"
                  value={new Date(detail.validation.reviewedAt).toLocaleString("fr-FR")}
                />
              )}
              {detail.validation?.rejection && (
                <div
                  className="alert alert-danger"
                  style={{ fontSize: 13, padding: 12 }}
                >
                  <strong>Refusé : </strong>
                  {VALIDATION_REJECT_REASON_LABELS[detail.validation.rejection.reason]}
                  {detail.validation.rejection.note ? (
                    <div style={{ marginTop: 4, color: "var(--gray-700)" }}>
                      {detail.validation.rejection.note}
                    </div>
                  ) : null}
                </div>
              )}
              {detail.validation?.lastInfoRequest && (
                <div
                  className="alert alert-info"
                  style={{ fontSize: 13, padding: 12 }}
                >
                  <strong>Information demandée le </strong>
                  {new Date(
                    detail.validation.lastInfoRequest.requestedAt,
                  ).toLocaleString("fr-FR")}
                  <div style={{ marginTop: 4, color: "var(--gray-700)" }}>
                    {detail.validation.lastInfoRequest.message}
                  </div>
                </div>
              )}
              {!detail.validation && (
                <p style={{ color: "var(--gray-500)", fontSize: 13 }}>
                  Aucune action administrateur enregistrée.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="sheet-footer">
          {detail?.status === "pending" ? (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setInfo(true)}
                disabled={busy}
              >
                <Icon name="message-square" size={14} /> Demander info
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setReject(true)}
                  disabled={busy}
                >
                  <Icon name="x" size={14} /> Refuser
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={onApprove}
                  disabled={busy || !canApprove}
                  title={
                    !canApprove && kind === "driver"
                      ? "Tous les documents doivent être approuvés d'abord"
                      : undefined
                  }
                >
                  <Icon name="check" size={14} /> Valider
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>

      {reject && detail && (
        <RejectModal
          item={detail}
          onClose={() => setReject(false)}
          onSubmit={onReject}
        />
      )}
      {info && detail && (
        <InfoRequestModal
          item={detail}
          onClose={() => setInfo(false)}
          onSubmit={onInfo}
        />
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--gray-500)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value || "—"}</div>
    </div>
  );
}

export function ValidationsPro() {
  const { pushToast } = useToast();
  const [kind, setKind] = useState<ValidationKind | "all">("all");
  const [status, setStatus] = useState<ValidationStatus>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Counts>({
    pending: 0,
    drivers: 0,
    companies: 0,
    partners: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openItem, setOpenItem] = useState<{
    id: string;
    kind: ValidationKind;
  } | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (kind !== "all") params.set("kind", kind);
      const res = await fetch(`/api/admin/validations?${params.toString()}`, {
        credentials: "include",
      });
      const data = (await res.json()) as { items: QueueItem[]; counts: Counts };
      setItems(data.items ?? []);
      setCounts(data.counts ?? counts);
    } catch (e) {
      pushToast({
        kind: "danger",
        title: "Erreur",
        desc: (e as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        i.city?.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Validations</h1>
          <p className="subtitle">
            Vérifiez les dossiers en attente avant activation.
          </p>
        </div>
      </div>

      <div className="tabs">
        <div
          className={"tab" + (kind === "all" ? " active" : "")}
          onClick={() => setKind("all")}
        >
          Tous <span className="tab-count">{counts.pending}</span>
        </div>
        <div
          className={"tab" + (kind === "driver" ? " active" : "")}
          onClick={() => setKind("driver")}
        >
          Chauffeurs <span className="tab-count">{counts.drivers}</span>
        </div>
        <div
          className={"tab" + (kind === "company" ? " active" : "")}
          onClick={() => setKind("company")}
        >
          Entreprises <span className="tab-count">{counts.companies}</span>
        </div>
        <div
          className={"tab" + (kind === "partner" ? " active" : "")}
          onClick={() => setKind("partner")}
        >
          Partenaires <span className="tab-count">{counts.partners}</span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {(
            [
              ["pending", "En attente"],
              ["validated", "Validés"],
              ["rejected", "Refusés"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={"chip " + (status === k ? "chip-filled-navy" : "chip-outline")}
              onClick={() => setStatus(k)}
            >
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Icon
              name="search"
              size={14}
              style={{ position: "absolute", left: 12, top: 10, color: "var(--gray-500)" }}
            />
            <input
              className="input compact"
              placeholder="Rechercher par nom, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 34, width: 280, height: 36 }}
            />
          </div>
        </div>
      </div>

      <div className="card card-flush">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Nom</th>
              <th>Email</th>
              <th>Ville</th>
              <th>Soumis</th>
              <th>Détails</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: 24 }}>
                  Chargement…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--gray-500)", padding: 24 }}>
                  Aucun dossier {STATUS_LABEL[status].toLowerCase()}.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((r) => (
                <tr
                  key={`${r.kind}:${r.id}`}
                  onClick={() => setOpenItem({ id: r.id, kind: r.kind })}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <span className="chip chip-outline">{KIND_LABEL[r.kind]}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                  </td>
                  <td style={{ color: "var(--gray-600)" }}>{r.email}</td>
                  <td>{r.city ?? "—"}</td>
                  <td style={{ color: "var(--gray-500)" }}>{timeAgo(r.submittedAt)}</td>
                  <td style={{ fontSize: 12, color: "var(--gray-600)" }}>
                    {r.kind === "driver" && r.summary
                      ? `${r.summary.docsCompleted}/${r.summary.docsRequired} docs${r.summary.documentsApproved ? " · ok" : ""}`
                      : r.kind === "company" && r.summary
                        ? r.summary.sector ?? "—"
                        : r.kind === "partner" && r.summary
                          ? r.summary.venueAddress ?? "—"
                          : "—"}
                  </td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-ghost compact"
                      onClick={() => setOpenItem({ id: r.id, kind: r.kind })}
                    >
                      Voir dossier
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {openItem && (
        <DetailSheet
          itemId={openItem.id}
          kind={openItem.kind}
          onClose={() => setOpenItem(null)}
          onChange={reload}
        />
      )}
    </div>
  );
}
