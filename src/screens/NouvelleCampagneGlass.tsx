"use client";

/**
 * NouvelleCampagneGlass — rond/vitré new-campaign wizard.
 * Port of glass-screens.jsx's <NouvelleCampagneGlass>.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/contexts/ToastContext";

type Step = 1 | 2 | 3;

const TIER_CENTS: Record<"boost" | "growth" | "leader", number> = {
  boost: 150000,
  growth: 350000,
  leader: 800000,
};

const TIER_LABELS: Record<"boost" | "growth" | "leader", { name: string; price: string }> = {
  boost: { name: "BOOST", price: "1 500 €" },
  growth: { name: "GROWTH", price: "3 500 €" },
  leader: { name: "LEADER", price: "8 000 €" },
};

export function NouvelleCampagneGlass() {
  const router = useRouter();
  const { pushToast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({
    type: "flocage" as "flocage" | "borne",
    title: "",
    desc: "",
    city: "",
    zones: "",
    start: "",
    end: "",
    tier: "growth" as "boost" | "growth" | "leader",
    driversNeeded: 3,
    rewardCents: 25000,
    borneCount: 5,
    targetImpressions: 100000,
  });
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        campaignType: form.type,
        title: form.title,
        description: form.desc,
        city: form.city,
        zones: form.zones
          ? form.zones
              .split(",")
              .map((z) => z.trim())
              .filter(Boolean)
          : [],
        startDate: form.start,
        endDate: form.end,
        budgetTier: form.tier,
        budgetCents: TIER_CENTS[form.tier],
        ...(form.type === "flocage"
          ? {
              rewardCents: form.rewardCents,
              driversNeeded: form.driversNeeded,
            }
          : {
              borne: { count: form.borneCount, targetImpressions: form.targetImpressions },
            }),
      };
      const res = await fetch("/api/me/campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Erreur");
      router.push("/campagnes/" + data.campaign.id);
    } catch (e) {
      pushToast({ kind: "danger", title: "Erreur", desc: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, margin: 0 }}>
            Nouvelle campagne
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--gray-500)", fontSize: 13 }}>
            Étape {step} sur 3
          </p>
        </div>
        <Link
          href="/campagnes"
          className="glass-btn"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Icon name="x" size={14} /> Annuler
        </Link>
      </div>

      {/* Step progress indicator */}
      <div className="glass-stepper">
        {(
          [
            { s: 1, l: "Brief" },
            { s: 2, l: "Ciblage" },
            { s: 3, l: "Budget & chauffeurs" },
          ] as const
        ).map((x, i) => (
          <div key={x.s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className={"glass-step" + (step >= x.s ? " active" : "")}>
              <span>{x.s}</span> {x.l}
            </div>
            {i < 2 && <div className="glass-step-sep" />}
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: 28 }}>
        {/* ── STEP 1: Brief ── */}
        {step === 1 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="glass-field" style={{ gridColumn: "1/-1" }}>
              <label className="glass-label">Titre de la campagne</label>
              <input
                className="glass-input"
                placeholder="Ex. Lancement printemps"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="glass-field" style={{ gridColumn: "1/-1" }}>
              <label className="glass-label">Description</label>
              <textarea
                className="glass-input"
                rows={4}
                placeholder="Brief créatif, ton, objectifs…"
                value={form.desc}
                onChange={(e) => set("desc", e.target.value)}
                maxLength={2000}
                required
              />
            </div>
            <div className="glass-field" style={{ gridColumn: "1/-1" }}>
              <label className="glass-label">Type de campagne</label>
              <div className="glass-segmented">
                {(["flocage", "borne"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={form.type === t ? "active" : ""}
                    onClick={() => set("type", t)}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Ciblage ── */}
        {step === 2 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="glass-field" style={{ gridColumn: "1/-1" }}>
              <label className="glass-label">Ville principale</label>
              <input
                className="glass-input"
                placeholder="Ex. Paris"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                required
              />
            </div>
            <div className="glass-field" style={{ gridColumn: "1/-1" }}>
              <label className="glass-label">
                Zones <span style={{ color: "var(--gray-400)", fontWeight: 400 }}>(optionnel — séparées par des virgules)</span>
              </label>
              <input
                className="glass-input"
                placeholder="Ex. 75001, 75002, La Défense"
                value={form.zones}
                onChange={(e) => set("zones", e.target.value)}
              />
            </div>
            <div className="glass-field">
              <label className="glass-label">Date de début</label>
              <input
                className="glass-input"
                type="date"
                value={form.start}
                onChange={(e) => set("start", e.target.value)}
                required
              />
            </div>
            <div className="glass-field">
              <label className="glass-label">Date de fin</label>
              <input
                className="glass-input"
                type="date"
                value={form.end}
                onChange={(e) => set("end", e.target.value)}
                required
              />
            </div>
          </div>
        )}

        {/* ── STEP 3: Budget ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Offer cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {(["boost", "growth", "leader"] as const).map((tier) => {
                const selected = form.tier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => set("tier", tier)}
                    style={{
                      padding: 20,
                      border: selected
                        ? "2px solid var(--accent, #6366f1)"
                        : "1px solid rgba(0,0,0,0.1)",
                      borderRadius: 14,
                      textAlign: "center",
                      background: selected
                        ? "rgba(99,102,241,0.08)"
                        : "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                      transition: "border 0.15s, background 0.15s",
                      outline: "none",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: selected ? "var(--accent, #6366f1)" : "var(--gray-500)",
                      }}
                    >
                      {TIER_LABELS[tier].name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 24,
                        fontWeight: 700,
                        margin: "8px 0",
                        color: selected ? "var(--accent, #6366f1)" : "inherit",
                      }}
                    >
                      {TIER_LABELS[tier].price}
                    </div>
                    {selected && (
                      <div style={{ fontSize: 11, color: "var(--accent, #6366f1)", marginTop: 4 }}>
                        <Icon name="check" size={12} /> Sélectionné
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Flocage-specific fields */}
            {form.type === "flocage" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="glass-field">
                  <label className="glass-label">Chauffeurs nécessaires</label>
                  <input
                    className="glass-input"
                    type="number"
                    min={1}
                    value={form.driversNeeded}
                    onChange={(e) => set("driversNeeded", Number(e.target.value))}
                  />
                </div>
                <div className="glass-field">
                  <label className="glass-label">Rémunération par chauffeur (€/mois)</label>
                  <input
                    className="glass-input"
                    type="number"
                    min={0}
                    step={10}
                    value={form.rewardCents / 100}
                    onChange={(e) => set("rewardCents", Math.round(Number(e.target.value) * 100))}
                  />
                </div>
              </div>
            )}

            {/* Borne-specific fields */}
            {form.type === "borne" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="glass-field">
                  <label className="glass-label">Nombre de bornes</label>
                  <input
                    className="glass-input"
                    type="number"
                    min={1}
                    value={form.borneCount}
                    onChange={(e) => set("borneCount", Number(e.target.value))}
                  />
                </div>
                <div className="glass-field">
                  <label className="glass-label">Impressions cibles</label>
                  <input
                    className="glass-input"
                    type="number"
                    min={1000}
                    step={1000}
                    value={form.targetImpressions}
                    onChange={(e) => set("targetImpressions", Number(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div
          className="glass-sticky"
          style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}
        >
          <button
            type="button"
            className="glass-btn"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
            disabled={step === 1}
          >
            <Icon name="chevron-left" size={14} /> Précédent
          </button>

          {step < 3 ? (
            <button
              type="button"
              className="glass-btn glass-btn-primary"
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Suivant <Icon name="chevron-right" size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="glass-btn glass-btn-primary"
              onClick={submit}
              disabled={busy}
            >
              {busy ? "Création…" : "Créer la campagne"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
