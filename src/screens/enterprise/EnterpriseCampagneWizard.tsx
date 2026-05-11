"use client";

/**
 * EnterpriseCampagneWizard — 3-step campaign creation/editing wizard.
 *
 * Mode "create": no initial id, builds payload from scratch, calls POST.
 * Mode "edit":   loads existing draft (or post-publish), allows editing
 *                 within the field-edit gates enforced server-side.
 *
 * Steps: 1) Brief — name, type, brand, description, assets
 *        2) Targeting — city, zones, dates, capacity (drivers OR bornes)
 *        3) Budget — tier picker, total budget, reward (Flocage), review
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

const CITY_OPTIONS = [
  "Paris",
  "Lyon",
  "Marseille",
  "Bordeaux",
  "Toulouse",
  "Nantes",
  "Lille",
  "Nice",
  "Caen",
];

type CampaignType = "flocage" | "borne";
type BudgetTier = "boost" | "growth" | "leader";

const TIER_LABEL: Record<BudgetTier, string> = {
  boost: "BOOST",
  growth: "GROWTH",
  leader: "LEADER",
};

// Mirror of BUDGET_TIER_PRESETS on the server.
const TIER_PRESET: Record<
  BudgetTier,
  {
    blurb: string;
    budgetCents: number;
    durationDays: number;
    flocageDrivers: number;
    flocageRewardCents: number;
    borneCount: number;
    borneTargetImpressions: number;
  }
> = {
  boost: {
    blurb: "Test rapide. 14 j, ~1 500 €.",
    budgetCents: 150_000,
    durationDays: 14,
    flocageDrivers: 3,
    flocageRewardCents: 30_000,
    borneCount: 2,
    borneTargetImpressions: 10_000,
  },
  growth: {
    blurb: "Couverture large. 30 j, ~5 000 €.",
    budgetCents: 500_000,
    durationDays: 30,
    flocageDrivers: 8,
    flocageRewardCents: 50_000,
    borneCount: 5,
    borneTargetImpressions: 30_000,
  },
  leader: {
    blurb: "Leadership marché. 60 j, 12 000 €+.",
    budgetCents: 1_200_000,
    durationDays: 60,
    flocageDrivers: 20,
    flocageRewardCents: 50_000,
    borneCount: 12,
    borneTargetImpressions: 100_000,
  },
};

type AssetLite = {
  id: string;
  name: string;
  type: "visual" | "video" | "logo" | "brief";
  file: { url: string; resourceType: "image" | "video" | "raw" };
};

type CampaignDTO = {
  id: string;
  campaignType: CampaignType;
  brand: string;
  domain: string;
  title: string;
  description: string;
  city: string;
  zones: string[];
  startDate: string;
  endDate: string;
  durationDays: number;
  budgetTier: BudgetTier;
  budgetCents: number;
  rewardCents: number;
  driversNeeded: number;
  borne?: { count: number; targetImpressions: number };
  assetIds?: string[];
  status: "draft" | "upcoming" | "active" | "completed";
};

type CompanyLite = {
  companyName: string;
  domain: string;
  city?: string;
};

type Props = {
  initialId?: string;
};

const ERROR_LABEL: Record<string, string> = {
  invalid_title: "Titre invalide.",
  invalid_description: "Description invalide.",
  invalid_city: "Ville invalide.",
  invalid_dates: "Dates invalides.",
  invalid_type: "Type invalide.",
  invalid_tier: "Tier invalide.",
  invalid_budget: "Budget invalide.",
  invalid_capacity: "Capacité invalide.",
  invalid_reward: "Rémunération invalide.",
  invalid_zones: "Zones invalides.",
  invalid_assets: "Assets invalides.",
  invalid_brand: "Marque/domaine invalide.",
  invalid_borne: "Configuration borne invalide.",
  frozen_field: "Ce champ est verrouillé après publication.",
  already_published: "Campagne déjà publiée.",
  draft_only: "Action réservée aux brouillons.",
};

function todayPlus(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export function EnterpriseCampagneWizard({ initialId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state — flat for simplicity. Sent to server on save/publish.
  const [campaignType, setCampaignType] = useState<CampaignType>("flocage");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [city, setCity] = useState("Paris");
  const [zonesText, setZonesText] = useState("");
  const [startDate, setStartDate] = useState(todayPlus(7));
  const [endDate, setEndDate] = useState(todayPlus(7 + 30));
  const [budgetTier, setBudgetTier] = useState<BudgetTier>("growth");
  const [budgetEuros, setBudgetEuros] = useState("5000");
  const [rewardEuros, setRewardEuros] = useState("500");
  const [driversNeeded, setDriversNeeded] = useState("8");
  const [borneCount, setBorneCount] = useState("5");
  const [borneTargetImpressions, setBorneTargetImpressions] = useState("30000");
  const [status, setStatus] = useState<CampaignDTO["status"]>("draft");

  // Side data
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [company, setCompany] = useState<CompanyLite | null>(null);

  const isEditing = Boolean(initialId);
  const isDraft = status === "draft";

  // Initial load: company + assets + (if editing) campaign.
  const initialLoad = useCallback(async () => {
    setError(null);
    try {
      const [companyRes, assetsRes, campaignRes] = await Promise.all([
        fetch("/api/me/company", { cache: "no-store" }),
        fetch("/api/me/assets", { cache: "no-store" }),
        initialId
          ? fetch(`/api/me/campaigns/${initialId}`, { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      const companyBody = (await companyRes.json()) as {
        company?: CompanyLite;
        error?: string;
      };
      if (companyRes.ok && companyBody.company) {
        setCompany(companyBody.company);
        if (!brand) setBrand(companyBody.company.companyName);
        if (!domain) setDomain(companyBody.company.domain);
        if (!isEditing && companyBody.company.city) setCity(companyBody.company.city);
      }
      const assetsBody = (await assetsRes.json()) as {
        assets?: AssetLite[];
        error?: string;
      };
      if (assetsRes.ok && assetsBody.assets) {
        setAssets(assetsBody.assets);
      }
      if (campaignRes) {
        const cb = (await campaignRes.json()) as {
          campaign?: CampaignDTO;
          error?: string;
          message?: string;
        };
        if (!campaignRes.ok || !cb.campaign) {
          setError(cb.message ?? cb.error ?? "Erreur de chargement");
          return;
        }
        const c = cb.campaign;
        setCampaignType(c.campaignType);
        setTitle(c.title);
        setBrand(c.brand);
        setDomain(c.domain);
        setDescription(c.description);
        setAssetIds(c.assetIds ?? []);
        setCity(c.city);
        setZonesText(c.zones.join(", "));
        setStartDate(c.startDate.slice(0, 10));
        setEndDate(c.endDate.slice(0, 10));
        setBudgetTier(c.budgetTier);
        setBudgetEuros(String(Math.round(c.budgetCents / 100)));
        setRewardEuros(String(Math.round(c.rewardCents / 100)));
        setDriversNeeded(String(c.driversNeeded || 1));
        if (c.borne) {
          setBorneCount(String(c.borne.count));
          setBorneTargetImpressions(String(c.borne.targetImpressions));
        }
        setStatus(c.status);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  // Tier auto-fills empty/preset values when picked. Doesn't override
  // values the user has already meaningfully changed.
  function applyTier(t: BudgetTier) {
    setBudgetTier(t);
    const preset = TIER_PRESET[t];
    setBudgetEuros(String(Math.round(preset.budgetCents / 100)));
    if (campaignType === "flocage") {
      setDriversNeeded(String(preset.flocageDrivers));
      setRewardEuros(String(Math.round(preset.flocageRewardCents / 100)));
    } else {
      setBorneCount(String(preset.borneCount));
      setBorneTargetImpressions(String(preset.borneTargetImpressions));
    }
    // Stretch endDate to match preset duration if user hasn't customized.
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) {
      const newEnd = new Date(start);
      newEnd.setDate(newEnd.getDate() + preset.durationDays);
      setEndDate(newEnd.toISOString().slice(0, 10));
    }
  }

  const days = useMemo(() => {
    const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
    return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
  }, [startDate, endDate]);

  function buildPayload() {
    const zones = zonesText
      .split(",")
      .map((z) => z.trim())
      .filter(Boolean);
    const base = {
      campaignType,
      title: title.trim(),
      brand: brand.trim(),
      domain: domain.trim(),
      description: description.trim(),
      city,
      zones,
      startDate,
      endDate,
      budgetTier,
      budgetCents: Math.round(Number(budgetEuros) * 100),
      assetIds,
    };
    if (campaignType === "flocage") {
      return {
        ...base,
        rewardCents: Math.round(Number(rewardEuros) * 100),
        driversNeeded: Math.max(1, Math.round(Number(driversNeeded))),
      };
    }
    return {
      ...base,
      rewardCents: 0,
      driversNeeded: 0,
      borne: {
        count: Math.max(1, Math.round(Number(borneCount))),
        targetImpressions: Math.max(0, Math.round(Number(borneTargetImpressions))),
      },
    };
  }

  function validateStep(target: 1 | 2 | 3): string | null {
    if (target >= 1) {
      if (title.trim().length < 3) return "Titre trop court.";
      if (!description.trim()) return "Description requise.";
      if (!brand.trim()) return "Marque requise.";
    }
    if (target >= 2) {
      if (!city) return "Ville requise.";
      if (new Date(endDate) <= new Date(startDate)) return "Date de fin invalide.";
      if (campaignType === "flocage" && Number(driversNeeded) < 1) {
        return "Au moins 1 chauffeur requis.";
      }
      if (campaignType === "borne" && Number(borneCount) < 1) {
        return "Au moins 1 borne requise.";
      }
    }
    if (target >= 3) {
      if (!Number(budgetEuros) || Number(budgetEuros) < 1) {
        return "Budget invalide.";
      }
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (step < 3) setStep(((step + 1) as 1 | 2 | 3));
  }

  function goBack() {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3);
  }

  async function persist(action: "draft" | "publish") {
    const err = validateStep(3);
    if (err) {
      setError(err);
      setStep(err.startsWith("Titre") || err.startsWith("Description") || err.startsWith("Marque") ? 1 : err.startsWith("Budget") ? 3 : 2);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      let id = initialId ?? null;
      if (id) {
        const res = await fetch(`/api/me/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          setError(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
          return;
        }
      } else {
        const res = await fetch("/api/me/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await res.json()) as {
          campaign?: { id: string };
          error?: string;
          message?: string;
        };
        if (!res.ok || !body.campaign) {
          setError(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
          return;
        }
        id = body.campaign.id;
      }
      if (action === "publish" && id) {
        const pub = await fetch(`/api/me/campaigns/${id}/publish`, {
          method: "POST",
        });
        const pubBody = (await pub.json()) as { error?: string; message?: string };
        if (!pub.ok) {
          setError(ERROR_LABEL[pubBody.error ?? ""] ?? pubBody.message ?? "Erreur");
          return;
        }
      }
      router.push("/enterprise/campagnes");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (!initialId || !isDraft) return;
    if (!confirm("Supprimer ce brouillon ?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/me/campaigns/${initialId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        alert(ERROR_LABEL[body.error ?? ""] ?? "Erreur");
        return;
      }
      router.push("/enterprise/campagnes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <div>
            <h1 style={titleStyle}>Nouvelle campagne</h1>
            <p style={subStyle}>Chargement…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-page">
      <div className="glass-pagehead">
        <div>
          <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>
            <Link
              href="/enterprise/campagnes"
              style={{ color: "var(--navy)", textDecoration: "none" }}
            >
              ← Mes campagnes
            </Link>
          </div>
          <h1 style={titleStyle}>
            {isEditing ? title || "Modifier la campagne" : "Nouvelle campagne"}
          </h1>
          <p style={subStyle}>
            {isEditing
              ? `Statut : ${status}${isDraft ? " · brouillon modifiable" : " · champs commerciaux verrouillés"}`
              : "Brief votre diffusion en 3 étapes."}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div
        className="glass-panel"
        style={{
          padding: 16,
          marginBottom: 20,
          display: "flex",
          gap: 12,
        }}
      >
        {([1, 2, 3] as const).map((n) => (
          <div
            key={n}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              background: n === step ? "var(--navy-soft)" : "transparent",
              border:
                n === step
                  ? "1px solid rgba(35,52,102,0.25)"
                  : "1px solid rgba(35,52,102,0.06)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--gray-500)", fontWeight: 600 }}>
              Étape {n}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
              {n === 1 ? "Brief" : n === 2 ? "Ciblage" : "Budget"}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}

      {/* Step content */}
      <div className="glass-panel" style={{ padding: 20, marginBottom: 20 }}>
        {step === 1 && (
          <Step1
            campaignType={campaignType}
            setCampaignType={setCampaignType}
            title={title}
            setTitle={setTitle}
            brand={brand}
            setBrand={setBrand}
            domain={domain}
            setDomain={setDomain}
            description={description}
            setDescription={setDescription}
            assets={assets}
            assetIds={assetIds}
            setAssetIds={setAssetIds}
            isDraft={isDraft}
            companyName={company?.companyName ?? ""}
          />
        )}
        {step === 2 && (
          <Step2
            campaignType={campaignType}
            city={city}
            setCity={setCity}
            zonesText={zonesText}
            setZonesText={setZonesText}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            driversNeeded={driversNeeded}
            setDriversNeeded={setDriversNeeded}
            borneCount={borneCount}
            setBorneCount={setBorneCount}
            borneTargetImpressions={borneTargetImpressions}
            setBorneTargetImpressions={setBorneTargetImpressions}
            isDraft={isDraft}
            days={days}
          />
        )}
        {step === 3 && (
          <Step3
            campaignType={campaignType}
            budgetTier={budgetTier}
            applyTier={applyTier}
            budgetEuros={budgetEuros}
            setBudgetEuros={setBudgetEuros}
            rewardEuros={rewardEuros}
            setRewardEuros={setRewardEuros}
            isDraft={isDraft}
            days={days}
            // Recap data
            title={title}
            city={city}
            startDate={startDate}
            endDate={endDate}
            driversNeeded={driversNeeded}
            borneCount={borneCount}
          />
        )}
      </div>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 && (
            <button
              type="button"
              className="glass-btn ghost"
              onClick={goBack}
              disabled={saving}
            >
              ← Retour
            </button>
          )}
          {isEditing && isDraft && (
            <button
              type="button"
              className="glass-btn ghost"
              style={{ color: "#B91C1C" }}
              onClick={deleteDraft}
              disabled={saving}
            >
              <Icon name="trash" size={14} /> Supprimer brouillon
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {step < 3 && (
            <button
              type="button"
              className="glass-btn"
              onClick={goNext}
              disabled={saving}
            >
              Suivant →
            </button>
          )}
          {step === 3 && (
            <>
              <button
                type="button"
                className="glass-btn ghost"
                onClick={() => persist("draft")}
                disabled={saving}
              >
                Enregistrer brouillon
              </button>
              {isDraft && (
                <button
                  type="button"
                  className="glass-btn"
                  onClick={() => persist("publish")}
                  disabled={saving}
                >
                  <Icon name="check" size={14} /> Publier
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Step components -------------------------------------------------------

function Step1(props: {
  campaignType: CampaignType;
  setCampaignType: (v: CampaignType) => void;
  title: string;
  setTitle: (v: string) => void;
  brand: string;
  setBrand: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  assets: AssetLite[];
  assetIds: string[];
  setAssetIds: (v: string[]) => void;
  isDraft: boolean;
  companyName: string;
}) {
  function toggleAsset(id: string) {
    if (props.assetIds.includes(id)) {
      props.setAssetIds(props.assetIds.filter((a) => a !== id));
    } else {
      props.setAssetIds([...props.assetIds, id]);
    }
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Type de diffusion">
        <div className="ent-seg">
          <button
            type="button"
            className={props.campaignType === "flocage" ? "active" : ""}
            onClick={() => props.setCampaignType("flocage")}
            disabled={!props.isDraft}
          >
            Flocage véhicule
          </button>
          <button
            type="button"
            className={props.campaignType === "borne" ? "active" : ""}
            onClick={() => props.setCampaignType("borne")}
            disabled={!props.isDraft}
          >
            Borne kiosque
          </button>
        </div>
      </Field>
      <Field label="Nom de la campagne">
        <input
          className="glass-input"
          value={props.title}
          onChange={(e) => props.setTitle(e.target.value)}
          placeholder="Ex. Nova Printemps 2026"
          maxLength={120}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Marque">
          <input
            className="glass-input"
            value={props.brand}
            onChange={(e) => props.setBrand(e.target.value)}
            placeholder={props.companyName || "Nom marque"}
            maxLength={120}
          />
        </Field>
        <Field label="Domaine">
          <input
            className="glass-input"
            value={props.domain}
            onChange={(e) => props.setDomain(e.target.value)}
            placeholder="ex. nova-cosmetique.fr"
            maxLength={120}
          />
        </Field>
      </div>
      <Field label="Objectif / brief">
        <textarea
          className="glass-input"
          rows={4}
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
          placeholder="Décrivez l'objectif (notoriété, lancement, trafic boutique…) et toute contrainte créative."
          style={{ resize: "vertical" }}
          maxLength={2000}
        />
      </Field>
      <Field label={`Assets (${props.assetIds.length} sélectionné${props.assetIds.length > 1 ? "s" : ""})`}>
        {props.assets.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
            Aucun asset disponible.{" "}
            <Link href="/enterprise/assets" style={{ color: "var(--navy)" }}>
              Téléverser un asset
            </Link>
            .
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {props.assets.map((a) => {
              const selected = props.assetIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAsset(a.id)}
                  style={{
                    padding: 0,
                    border: selected
                      ? "2px solid var(--navy)"
                      : "1px solid rgba(35,52,102,0.12)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      height: 80,
                      backgroundImage:
                        a.file.resourceType === "image"
                          ? `url(${a.file.url})`
                          : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      background:
                        a.file.resourceType !== "image"
                          ? "linear-gradient(135deg,#3B82F6,#6366F1)"
                          : undefined,
                    }}
                  />
                  <div
                    style={{
                      padding: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#0F172A",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {a.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Field>
    </div>
  );
}

function Step2(props: {
  campaignType: CampaignType;
  city: string;
  setCity: (v: string) => void;
  zonesText: string;
  setZonesText: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  driversNeeded: string;
  setDriversNeeded: (v: string) => void;
  borneCount: string;
  setBorneCount: (v: string) => void;
  borneTargetImpressions: string;
  setBorneTargetImpressions: (v: string) => void;
  isDraft: boolean;
  days: number;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Field label="Ville">
        <select
          className="glass-input"
          value={props.city}
          onChange={(e) => props.setCity(e.target.value)}
          disabled={!props.isDraft}
        >
          {CITY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Zones (quartiers, codes postaux — séparés par virgules)">
        <input
          className="glass-input"
          value={props.zonesText}
          onChange={(e) => props.setZonesText(e.target.value)}
          placeholder="ex. 75001, 75002, Marais"
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 12, alignItems: "end" }}>
        <Field label="Début">
          <input
            type="date"
            className="glass-input"
            value={props.startDate}
            onChange={(e) => props.setStartDate(e.target.value)}
            disabled={!props.isDraft}
          />
        </Field>
        <Field label="Fin">
          <input
            type="date"
            className="glass-input"
            value={props.endDate}
            onChange={(e) => props.setEndDate(e.target.value)}
          />
        </Field>
        <MiniKpi label="Durée" value={`${props.days} j`} />
      </div>
      {props.campaignType === "flocage" ? (
        <Field label="Chauffeurs nécessaires">
          <input
            type="number"
            min="1"
            className="glass-input"
            value={props.driversNeeded}
            onChange={(e) => props.setDriversNeeded(e.target.value)}
            disabled={!props.isDraft}
          />
        </Field>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Nombre de bornes">
            <input
              type="number"
              min="1"
              className="glass-input"
              value={props.borneCount}
              onChange={(e) => props.setBorneCount(e.target.value)}
              disabled={!props.isDraft}
            />
          </Field>
          <Field label="Impressions visées">
            <input
              type="number"
              min="0"
              className="glass-input"
              value={props.borneTargetImpressions}
              onChange={(e) => props.setBorneTargetImpressions(e.target.value)}
              disabled={!props.isDraft}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Step3(props: {
  campaignType: CampaignType;
  budgetTier: BudgetTier;
  applyTier: (t: BudgetTier) => void;
  budgetEuros: string;
  setBudgetEuros: (v: string) => void;
  rewardEuros: string;
  setRewardEuros: (v: string) => void;
  isDraft: boolean;
  days: number;
  title: string;
  city: string;
  startDate: string;
  endDate: string;
  driversNeeded: string;
  borneCount: string;
}) {
  const dailyBudget =
    props.days > 0 ? Math.round(Number(props.budgetEuros) / props.days) : 0;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Field label="Tier">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {(["boost", "growth", "leader"] as BudgetTier[]).map((t) => {
            const selected = props.budgetTier === t;
            const preset = TIER_PRESET[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => props.applyTier(t)}
                disabled={!props.isDraft}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  border: selected
                    ? "2px solid var(--navy)"
                    : "1px solid rgba(35,52,102,0.12)",
                  background: selected ? "var(--navy-soft)" : "rgba(255,255,255,0.7)",
                  cursor: props.isDraft ? "pointer" : "not-allowed",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {TIER_LABEL[t]}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--gray-500)", marginTop: 4 }}>
                  {preset.blurb}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>
                  {Math.round(preset.budgetCents / 100).toLocaleString("fr-FR")} €
                </div>
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Budget total (€)">
          <input
            type="number"
            min="1"
            className="glass-input"
            value={props.budgetEuros}
            onChange={(e) => props.setBudgetEuros(e.target.value)}
            disabled={!props.isDraft}
          />
        </Field>
        <MiniKpi label="~ par jour" value={`${dailyBudget} €`} />
      </div>
      {props.campaignType === "flocage" && (
        <Field label="Rémunération par chauffeur (€)">
          <input
            type="number"
            min="0"
            className="glass-input"
            value={props.rewardEuros}
            onChange={(e) => props.setRewardEuros(e.target.value)}
            disabled={!props.isDraft}
          />
        </Field>
      )}

      {/* Recap */}
      <div
        className="glass-panel"
        style={{ padding: 16, background: "rgba(255,255,255,0.5)" }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Récapitulatif</div>
        <Row k="Type" v={props.campaignType === "flocage" ? "Flocage véhicule" : "Borne kiosque"} />
        <Row k="Nom" v={props.title || "—"} />
        <Row k="Ville" v={props.city} />
        <Row k="Période" v={`${props.startDate} → ${props.endDate}`} />
        {props.campaignType === "flocage" ? (
          <Row k="Chauffeurs" v={props.driversNeeded} />
        ) : (
          <Row k="Bornes" v={props.borneCount} />
        )}
        <Row k="Tier" v={TIER_LABEL[props.budgetTier]} />
        <Row k="Budget" v={`${Number(props.budgetEuros).toLocaleString("fr-FR")} €`} />
      </div>
    </div>
  );
}

// --- Small helpers ---------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gray-500)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 10, background: "var(--navy-soft)", borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: "var(--gray-500)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--gray-500)" }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 28,
  margin: 0,
};
const subStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--gray-500)",
  fontSize: 13,
};
const errorBoxStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: "rgba(239,68,68,0.08)",
  color: "#b91c1c",
  borderRadius: 10,
  fontSize: 13,
};
