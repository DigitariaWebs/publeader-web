"use client";

/**
 * PartenaireParametres — partner account settings, wired to /api/me/partner.
 * Single tab (P1 scope: business, manager, address, hours).
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type PartnerDTO = {
  id: string;
  businessName: string;
  managerName: string;
  phone: string;
  address: string;
  city: string;
  openingHours: string;
  monthlySprayRevenue: number;
  monthlyAdsRevenue: number;
  status: "pending" | "validated" | "rejected";
};

type FetchResponse = {
  partner: PartnerDTO;
  email: string;
};

export function PartenaireParametres() {
  const [partner, setPartner] = useState<PartnerDTO | null>(null);
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okFlash, setOkFlash] = useState(false);
  const [draft, setDraft] = useState<Partial<PartnerDTO>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/partner", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as FetchResponse;
      setPartner(body.partner);
      setEmail(body.email);
      setDraft({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setField = <K extends keyof PartnerDTO>(key: K, value: PartnerDTO[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const value = <K extends keyof PartnerDTO>(key: K): PartnerDTO[K] | undefined =>
    (draft[key] as PartnerDTO[K] | undefined) ?? partner?.[key];

  const isDirty = Object.keys(draft).length > 0;

  const save = async () => {
    if (!isDirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me/partner", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as FetchResponse;
      setPartner(body.partner);
      setEmail(body.email);
      setDraft({});
      setOkFlash(true);
      setTimeout(() => setOkFlash(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !partner) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <h1 style={{ fontSize: 28 }}>Paramètres</h1>
        </div>
        <p style={{ color: "var(--gray-500)" }}>Chargement…</p>
      </div>
    );
  }

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}
          >
            Paramètres
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            {partner?.businessName ?? "Votre commerce"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="glass-btn ghost"
            onClick={() => setDraft({})}
            disabled={!isDirty || saving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={save}
            disabled={!isDirty || saving}
          >
            <Icon name="check" size={14} /> {saving ? "Envoi…" : "Enregistrer"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: "#FEE2E2",
            color: "#991B1B",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      {okFlash && (
        <div
          style={{
            padding: 12,
            background: "#DCFCE7",
            color: "#166534",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          Modifications enregistrées.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Section title="Profil commerce">
          <Row>
            <Field label="Nom du commerce">
              <input
                type="text"
                style={inputStyle}
                value={value("businessName") ?? ""}
                onChange={(e) => setField("businessName", e.target.value)}
              />
            </Field>
            <Field label="Responsable">
              <input
                type="text"
                style={inputStyle}
                value={value("managerName") ?? ""}
                onChange={(e) => setField("managerName", e.target.value)}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Téléphone">
              <input
                type="tel"
                style={inputStyle}
                value={value("phone") ?? ""}
                onChange={(e) => setField("phone", e.target.value)}
              />
            </Field>
            <Field label="Email (lecture seule)">
              <input
                type="email"
                style={{ ...inputStyle, background: "var(--gray-100)" }}
                value={email}
                disabled
              />
            </Field>
          </Row>
          <Field label="Adresse">
            <input
              type="text"
              style={inputStyle}
              value={value("address") ?? ""}
              onChange={(e) => setField("address", e.target.value)}
            />
          </Field>
          <Field label="Ville">
            <input
              type="text"
              style={inputStyle}
              value={value("city") ?? ""}
              onChange={(e) => setField("city", e.target.value)}
            />
          </Field>
          <Field label="Horaires d'ouverture">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="ex: Lun-Ven 9h-19h, Sam 10h-18h"
              value={value("openingHours") ?? ""}
              onChange={(e) => setField("openingHours", e.target.value)}
            />
          </Field>
        </Section>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--gray-200)",
  borderRadius: 6,
  fontSize: 14,
  background: "white",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, marginBottom: 16, fontWeight: 700 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      {children}
    </div>
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
    <div>
      <label
        style={{
          display: "block",
          fontSize: 12,
          color: "var(--gray-600)",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
