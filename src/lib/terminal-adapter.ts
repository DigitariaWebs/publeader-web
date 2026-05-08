import type { Borne } from "./data";
import type { TerminalDTO } from "./terminal-serializer";

const VENUE_LABEL: Record<TerminalDTO["venueType"], string> = {
  bar: "Bar",
  restaurant: "Restaurant",
  hotel: "Hôtel",
  nightclub: "Nightclub",
  gym: "Salle de sport",
  other: "Autre",
};

const STATUS_LABEL: Record<TerminalDTO["status"], Borne["status"]> = {
  online: "En service",
  maintenance: "Maintenance",
  offline: "Hors ligne",
};

function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86400_000) return `il y a ${Math.floor(diff / 3600_000)} h`;
  return `il y a ${Math.floor(diff / 86400_000)} j`;
}

/**
 * Convert a TerminalDTO into the legacy Borne shape consumed by
 * BornesPro/BornesGlass screens. P3 (stock) and P5 (revenue) supply real
 * refill/sprays/rev later; for P2 we surface heartbeat-derived approximations.
 */
export function toBorne(t: TerminalDTO): Borne {
  // Map lat/lng to a 0–100 % grid for the placeholder map. France bounds.
  // Real map (Mapbox/Leaflet) replaces this in a future iteration.
  const x = clampPct(((t.coords.lng - -5) / (10 - -5)) * 100);
  const y = clampPct(((51.5 - t.coords.lat) / (51.5 - 41)) * 100);

  return {
    id: t.id,
    name: t.name,
    type: VENUE_LABEL[t.venueType],
    address: t.address,
    status: STATUS_LABEL[t.status],
    refill: relativeTime(t.lastHeartbeatAt),
    sprays: t.spraysToday,
    rev: "—",
    alert: t.status !== "online",
    x,
    y,
  };
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 50;
  return Math.max(2, Math.min(98, n));
}
