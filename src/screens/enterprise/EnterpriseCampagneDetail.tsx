"use client";

/**
 * EnterpriseCampagneDetail — advertiser detail view for one campaign.
 * Live data from /api/me/campaigns/[id] + nested driver/terminal endpoints.
 *
 * Tabs:
 *   - Aperçu      → brief, dates, capacity, computed metrics
 *   - Chauffeurs  → assigned drivers + assign UI (Flocage only)
 *   - Bornes      → terminal IDs + assign UI (Borne only)
 *   - Assets      → linked asset previews
 *
 * Performance/impressions are deferred to A6.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

type Status = "draft" | "upcoming" | "active" | "completed";
type CampaignType = "flocage" | "borne";
type BudgetTier = "boost" | "growth" | "leader";

type CampaignDTO = {
  id: string;
  brand: string;
  domain: string;
  title: string;
  description: string;
  campaignType: CampaignType;
  budgetTier: BudgetTier;
  budgetCents: number;
  city: string;
  zones: string[];
  startDate: string;
  endDate: string;
  durationDays: number;
  rewardCents: number;
  status: Status;
  progress: number;
  kmDone: number;
  kmTotal: number;
  driversNeeded: number;
  driversAssigned: number;
  assignedDriverIds: string[];
  borne?: { count: number; targetImpressions: number; terminalIds?: string[] };
  assetIds?: string[];
  brandColor?: string;
  brandLogoUrl?: string;
};

type AssignedDriver = {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  rating: number;
  campaignsDone: number;
  totalKm: number;
  phone: string;
};

type CampaignPerformanceDTO = {
  kpis: {
    impressionsTotal: number;
    reachTerminals: number;
    kmTotal: number;
    campaignDays: number;
  };
  impressionsTimeline: number[];
  fillRatePct: number;
  budgetCents: number;
  budgetConsumedPct: number;
};

type EligibleDriver = Omit<AssignedDriver, "phone">;

type AssetLite = {
  id: string;
  name: string;
  type: string;
  file: { url: string; resourceType: "image" | "video" | "raw" };
};

type Tab = "overview" | "drivers" | "terminals" | "assets";

const STATUS_LABEL: Record<Status, string> = {
  draft: "Brouillon",
  upcoming: "À venir",
  active: "En cours",
  completed: "Terminée",
};
const STATUS_TONE: Record<Status, string> = {
  draft: "warn",
  upcoming: "info",
  active: "paid",
  completed: "draft",
};
const TIER_LABEL: Record<BudgetTier, string> = {
  boost: "BOOST",
  growth: "GROWTH",
  leader: "LEADER",
};

const ERROR_LABEL: Record<string, string> = {
  not_found: "Introuvable.",
  forbidden: "Action non autorisée.",
  wrong_type: "Type de campagne incompatible.",
  not_published: "Campagne non publiée.",
  driver_not_validated: "Chauffeur non validé.",
  city_mismatch: "Ville du chauffeur incompatible.",
  driver_busy: "Chauffeur déjà sur une campagne en cours.",
  already_assigned: "Déjà assigné.",
  campaign_full: "Campagne complète.",
  invalid_terminal: "Identifiant terminal invalide.",
};

function formatEur(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function daysRemaining(c: CampaignDTO): number {
  const end = new Date(c.endDate).getTime();
  const remaining = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

function periodConsumedPct(c: CampaignDTO): number {
  if (c.status !== "active") return c.status === "completed" ? 100 : 0;
  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 100;
  const elapsed = Math.min(Math.max(0, now - start), total);
  return Math.round((elapsed / total) * 100);
}

interface Props {
  id: string;
}

export function EnterpriseCampagneDetail({ id }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [campaign, setCampaign] = useState<CampaignDTO | null>(null);
  const [drivers, setDrivers] = useState<AssignedDriver[]>([]);
  const [eligible, setEligible] = useState<EligibleDriver[]>([]);
  const [assets, setAssets] = useState<AssetLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [perf, setPerf] = useState<CampaignPerformanceDTO | null>(null);

  const reloadCampaign = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/me/campaigns/${id}`, { cache: "no-store" });
      const body = (await res.json()) as {
        campaign?: CampaignDTO;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? body.error ?? "Erreur de chargement");
        return null;
      }
      setCampaign(body.campaign ?? null);
      return body.campaign ?? null;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  const reloadDrivers = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/campaigns/${id}/drivers`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { drivers?: AssignedDriver[] };
      setDrivers(body.drivers ?? []);
    } catch {
      /* ignore — overview still works */
    }
  }, [id]);

  const reloadEligible = useCallback(async () => {
    try {
      const res = await fetch(`/api/me/campaigns/${id}/eligible-drivers`, {
        cache: "no-store",
      });
      const body = (await res.json()) as { drivers?: EligibleDriver[] };
      setEligible(body.drivers ?? []);
    } catch {
      /* ignore */
    }
  }, [id]);

  const reloadAssets = useCallback(async () => {
    try {
      const res = await fetch("/api/me/assets", { cache: "no-store" });
      const body = (await res.json()) as { assets?: AssetLite[] };
      setAssets(body.assets ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const reloadPerformance = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/me/campaigns/${id}/performance?period=30d`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const body = (await res.json()) as CampaignPerformanceDTO;
      setPerf(body);
    } catch {
      /* ignore — overview still works without perf */
    }
  }, [id]);

  useEffect(() => {
    let live = true;
    (async () => {
      const c = await reloadCampaign();
      if (!live || !c) {
        setLoading(false);
        return;
      }
      await Promise.all([
        c.campaignType === "flocage" ? reloadDrivers() : Promise.resolve(),
        c.campaignType === "flocage" && c.status !== "draft" && c.status !== "completed"
          ? reloadEligible()
          : Promise.resolve(),
        (c.assetIds?.length ?? 0) > 0 ? reloadAssets() : Promise.resolve(),
        c.status !== "draft" ? reloadPerformance() : Promise.resolve(),
      ]);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [reloadCampaign, reloadDrivers, reloadEligible, reloadAssets, reloadPerformance]);

  const linkedAssets = useMemo(() => {
    if (!campaign?.assetIds) return [];
    const ids = new Set(campaign.assetIds);
    return assets.filter((a) => ids.has(a.id));
  }, [campaign, assets]);

  async function handleAssign(driverId: string) {
    if (!campaign) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/campaigns/${id}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
        return;
      }
      await Promise.all([reloadCampaign(), reloadDrivers(), reloadEligible()]);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(driverId: string) {
    if (!confirm("Retirer ce chauffeur de la campagne ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/campaigns/${id}/drivers/${driverId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
        return;
      }
      await Promise.all([reloadCampaign(), reloadDrivers(), reloadEligible()]);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignTerminal() {
    const tid = terminalInput.trim();
    if (!tid) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/me/campaigns/${id}/terminals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminalId: tid }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
        return;
      }
      setTerminalInput("");
      await reloadCampaign();
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassignTerminal(tid: string) {
    if (!confirm(`Retirer le terminal ${tid} ?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/me/campaigns/${id}/terminals/${encodeURIComponent(tid)}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        alert(ERROR_LABEL[body.error ?? ""] ?? body.message ?? "Erreur");
        return;
      }
      await reloadCampaign();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>
            Chargement…
          </h1>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="glass-page">
        <div className="glass-pagehead">
          <div>
            <Link
              href="/enterprise/campagnes"
              style={{ color: "var(--navy)", fontSize: 13 }}
            >
              ← Mes campagnes
            </Link>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 26,
                margin: "8px 0 0",
              }}
            >
              Campagne introuvable
            </h1>
            {error && (
              <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isFlocage = campaign.campaignType === "flocage";
  const periodPct = periodConsumedPct(campaign);
  const remaining = daysRemaining(campaign);
  const driverFillPct = isFlocage
    ? campaign.driversNeeded > 0
      ? Math.round((campaign.driversAssigned / campaign.driversNeeded) * 100)
      : 0
    : 0;
  const kmPct =
    isFlocage && campaign.kmTotal > 0
      ? Math.round((campaign.kmDone / campaign.kmTotal) * 100)
      : 0;
  const terminalCount = campaign.borne?.terminalIds?.length ?? 0;
  const terminalCap = campaign.borne?.count ?? 0;
  const terminalPct =
    terminalCap > 0 ? Math.round((terminalCount / terminalCap) * 100) : 0;

  return (
    <div className="glass-page">
      <div className="glass-pagehead" style={{ alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--gray-500)", marginBottom: 6 }}>
            <Link
              href="/enterprise/campagnes"
              style={{ color: "var(--navy)", textDecoration: "none" }}
            >
              ← Mes campagnes
            </Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="brand-logo"
              style={{
                background: campaign.brandLogoUrl
                  ? `url(${campaign.brandLogoUrl}) center/cover`
                  : campaign.brandColor ?? "linear-gradient(135deg,#3B82F6,#6366F1)",
                width: 44,
                height: 44,
                fontSize: 16,
                color: "#fff",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
              }}
            >
              {!campaign.brandLogoUrl && initialsFor(campaign.brand)}
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 26,
                  margin: 0,
                }}
              >
                {campaign.title || campaign.brand}
              </h1>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--gray-500)",
                  marginTop: 4,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span>{isFlocage ? "Flocage" : "Borne"}</span>
                <span>·</span>
                <span>{campaign.city}</span>
                <span>·</span>
                <span>
                  {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
                </span>
                <span className={`ent-chip ${STATUS_TONE[campaign.status]}`}>
                  {STATUS_LABEL[campaign.status]}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {campaign.status === "draft" || campaign.status === "upcoming" ? (
            <Link
              href={`/enterprise/campagnes/${campaign.id}/edit`}
              className="glass-btn ghost"
            >
              <Icon name="sliders" size={14} /> Modifier
            </Link>
          ) : (
            <Link
              href={`/enterprise/campagnes/${campaign.id}/edit`}
              className="glass-btn ghost"
            >
              <Icon name="sliders" size={14} /> Modifier (limité)
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "rgba(239,68,68,0.08)",
            color: "#b91c1c",
            borderRadius: 10,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="ent-seg" style={{ marginBottom: 18 }}>
        {(
          [
            { id: "overview", label: "Aperçu" },
            ...(isFlocage
              ? [{ id: "drivers" as Tab, label: `Chauffeurs (${campaign.driversAssigned})` }]
              : [{ id: "terminals" as Tab, label: `Bornes (${terminalCount})` }]),
            { id: "assets" as Tab, label: `Assets (${campaign.assetIds?.length ?? 0})` },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div className="glass-panel">
            <div className="glass-panelhead">
              <h3 style={{ margin: 0, fontSize: 14 }}>Brief & ciblage</h3>
            </div>
            <div style={{ padding: 16, display: "grid", gap: 14 }}>
              <Info label="Marque" value={campaign.brand} />
              <Info label="Domaine" value={campaign.domain} />
              <Info label="Description" value={campaign.description || "—"} />
              <Info
                label="Zones"
                value={campaign.zones.length > 0 ? campaign.zones.join(", ") : "—"}
              />
              <Info
                label="Tier"
                value={`${TIER_LABEL[campaign.budgetTier]} · ${formatEur(campaign.budgetCents)}`}
              />
              {isFlocage ? (
                <Info
                  label="Rémunération chauffeur"
                  value={`${formatEur(campaign.rewardCents)} / chauffeur`}
                />
              ) : (
                <Info
                  label="Impressions visées"
                  value={(campaign.borne?.targetImpressions ?? 0).toLocaleString("fr-FR")}
                />
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="glass-panel">
              <div className="glass-panelhead">
                <h3 style={{ margin: 0, fontSize: 14 }}>Avancement</h3>
              </div>
              <div style={{ padding: 16, display: "grid", gap: 12 }}>
                <Stat
                  label={`Période (${remaining} j restants)`}
                  pct={periodPct}
                  caption={`${campaign.durationDays} jours au total`}
                />
                {isFlocage ? (
                  <>
                    <Stat
                      label="Chauffeurs"
                      pct={driverFillPct}
                      caption={`${campaign.driversAssigned} / ${campaign.driversNeeded}`}
                    />
                    <Stat
                      label="Kilomètres"
                      pct={kmPct}
                      caption={`${campaign.kmDone} / ${campaign.kmTotal} km`}
                    />
                  </>
                ) : (
                  <Stat
                    label="Bornes"
                    pct={terminalPct}
                    caption={`${terminalCount} / ${terminalCap}`}
                  />
                )}
              </div>
            </div>

            {perf && (
              <div className="glass-panel">
                <div className="glass-panelhead">
                  <h3 style={{ margin: 0, fontSize: 14 }}>Performance — 30 j</h3>
                </div>
                <div style={{ padding: 16, display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <PerfTile
                      label="Impressions"
                      value={perf.kpis.impressionsTotal.toLocaleString("fr-FR")}
                    />
                    <PerfTile
                      label="Bornes touchées"
                      value={perf.kpis.reachTerminals.toLocaleString("fr-FR")}
                    />
                    <PerfTile
                      label="Kilomètres"
                      value={`${perf.kpis.kmTotal.toLocaleString("fr-FR")} km`}
                    />
                    <PerfTile
                      label="Jours-campagne"
                      value={perf.kpis.campaignDays.toLocaleString("fr-FR")}
                    />
                  </div>
                  <PerfSparkline data={perf.impressionsTimeline} />
                  <Stat
                    label="Taux de remplissage"
                    pct={perf.fillRatePct}
                    caption={`${perf.fillRatePct} %`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "drivers" && isFlocage && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="glass-panel">
            <div className="glass-panelhead">
              <h3 style={{ margin: 0, fontSize: 14 }}>
                Chauffeurs assignés ({campaign.driversAssigned} / {campaign.driversNeeded})
              </h3>
              {campaign.status !== "draft" &&
                campaign.status !== "completed" &&
                campaign.driversAssigned < campaign.driversNeeded && (
                  <button
                    type="button"
                    className="glass-btn"
                    onClick={() => setShowAssign((v) => !v)}
                  >
                    <Icon name="user-plus" size={14} />{" "}
                    {showAssign ? "Fermer" : "Assigner un chauffeur"}
                  </button>
                )}
            </div>
            {drivers.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: "var(--gray-500)",
                }}
              >
                Aucun chauffeur assigné.
              </div>
            ) : (
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Chauffeur</th>
                    <th>Ville</th>
                    <th style={{ textAlign: "right" }}>Note</th>
                    <th style={{ textAlign: "right" }}>Campagnes</th>
                    <th style={{ textAlign: "right" }}>Km</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              background:
                                "linear-gradient(135deg, #14B8A6, #3B82F6)",
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          >
                            {initialsFor(`${d.firstName} ${d.lastName}`)}
                          </div>
                          <span style={{ fontWeight: 600 }}>
                            {d.firstName} {d.lastName}
                          </span>
                        </div>
                      </td>
                      <td>{d.city}</td>
                      <td style={{ textAlign: "right" }}>
                        {d.rating.toFixed(1)} ★
                      </td>
                      <td style={{ textAlign: "right" }}>{d.campaignsDone}</td>
                      <td style={{ textAlign: "right" }}>
                        {d.totalKm.toLocaleString("fr-FR")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {campaign.status !== "completed" && (
                          <button
                            type="button"
                            className="glass-btn ghost"
                            style={{ padding: "4px 10px", color: "#B91C1C" }}
                            disabled={busy}
                            onClick={() => handleUnassign(d.id)}
                          >
                            Retirer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {showAssign && (
            <div className="glass-panel">
              <div className="glass-panelhead">
                <h3 style={{ margin: 0, fontSize: 14 }}>
                  Chauffeurs éligibles ({eligible.length})
                </h3>
                <span style={{ fontSize: 12, color: "var(--gray-500)" }}>
                  Validés · ville {campaign.city} · disponibles
                </span>
              </div>
              {eligible.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--gray-500)",
                    fontSize: 13,
                  }}
                >
                  Aucun chauffeur éligible pour le moment.
                </div>
              ) : (
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Chauffeur</th>
                      <th>Ville</th>
                      <th style={{ textAlign: "right" }}>Note</th>
                      <th style={{ textAlign: "right" }}>Km</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligible.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.firstName} {d.lastName}
                        </td>
                        <td>{d.city}</td>
                        <td style={{ textAlign: "right" }}>
                          {d.rating.toFixed(1)} ★
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {d.totalKm.toLocaleString("fr-FR")}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="glass-btn"
                            style={{ padding: "4px 10px" }}
                            disabled={busy}
                            onClick={() => handleAssign(d.id)}
                          >
                            <Icon name="user-plus" size={12} /> Assigner
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "terminals" && !isFlocage && (
        <div className="glass-panel">
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>
              Terminaux assignés ({terminalCount} / {terminalCap})
            </h3>
          </div>
          <div style={{ padding: 16, display: "grid", gap: 12 }}>
            {campaign.status !== "completed" && terminalCount < terminalCap && (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="glass-input"
                  placeholder="Identifiant terminal (ex. KT-PARIS-014)"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  style={{ flex: 1 }}
                  maxLength={80}
                />
                <button
                  type="button"
                  className="glass-btn"
                  disabled={busy || !terminalInput.trim()}
                  onClick={handleAssignTerminal}
                >
                  <Icon name="plus" size={14} /> Assigner
                </button>
              </div>
            )}
            {terminalCount === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--gray-500)",
                  fontSize: 13,
                }}
              >
                Aucun terminal assigné.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {(campaign.borne?.terminalIds ?? []).map((tid) => (
                  <div
                    key={tid}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.6)",
                      border: "1px solid rgba(35,52,102,0.08)",
                      borderRadius: 10,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{tid}</span>
                    {campaign.status !== "completed" && (
                      <button
                        type="button"
                        className="glass-btn ghost"
                        style={{ padding: "4px 10px", color: "#B91C1C" }}
                        disabled={busy}
                        onClick={() => handleUnassignTerminal(tid)}
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "assets" && (
        <div className="glass-panel">
          <div className="glass-panelhead">
            <h3 style={{ margin: 0, fontSize: 14 }}>
              Assets liés ({linkedAssets.length})
            </h3>
            <Link
              href="/enterprise/assets"
              className="glass-btn ghost"
              style={{ padding: "4px 10px" }}
            >
              Bibliothèque
            </Link>
          </div>
          {linkedAssets.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                color: "var(--gray-500)",
              }}
            >
              Aucun asset lié. Modifiez la campagne pour en ajouter.
            </div>
          ) : (
            <div
              style={{
                padding: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              {linkedAssets.map((a) => (
                <a
                  key={a.id}
                  href={a.file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    border: "1px solid rgba(35,52,102,0.08)",
                    borderRadius: 10,
                    overflow: "hidden",
                    textDecoration: "none",
                    color: "inherit",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  <div
                    style={{
                      height: 100,
                      background:
                        a.file.resourceType === "image"
                          ? `url(${a.file.url}) center/cover`
                          : "linear-gradient(135deg,#3B82F6,#6366F1)",
                    }}
                  />
                  <div
                    style={{
                      padding: 10,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {a.name}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--gray-500)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: "#0A0E1F", marginTop: 3 }}>
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  pct,
  caption,
}: {
  label: string;
  pct: number;
  caption: string;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "var(--gray-500)",
          marginBottom: 6,
        }}
      >
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="glass-progress">
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
        {caption}
      </div>
    </div>
  );
}

function PerfTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(35,52,102,0.04)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--gray-500)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 700,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function PerfSparkline({ data }: { data: number[] }) {
  if (data.length < 2) {
    return (
      <div style={{ fontSize: 11, color: "var(--gray-500)" }}>
        Pas assez de points pour la courbe.
      </div>
    );
  }
  const w = 320;
  const h = 60;
  const maxY = Math.max(1, ...data);
  const dx = w / (data.length - 1);
  const path = data
    .map((v, i) => (i === 0 ? "M" : "L") + i * dx + "," + (h - (v / maxY) * (h - 4) - 2))
    .join(" ");
  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: "100%" }}
    >
      <path d={path} fill="none" stroke="#3B82F6" strokeWidth="1.5" />
    </svg>
  );
}
