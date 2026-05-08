import type {
  MaintenanceWindowDoc,
  TerminalDoc,
  TerminalEventDoc,
} from "./schemas";
import type { ResolvedTerminal } from "./terminal-service";

export type TerminalDTO = {
  id: string;
  partnerId: string;
  code: string;
  name: string;
  venueType: TerminalDoc["venueType"];
  address: string;
  city: string;
  coords: { lat: number; lng: number };
  status: TerminalDoc["lastKnownStatus"];
  spraysToday: number;
  screenStatus: TerminalDoc["screenStatus"];
  lastHeartbeatAt?: string;
  installedAt: string;
  decommissionedAt?: string;
  activeMaintenance?: MaintenanceWindowDTO;
  // Optional metrics — populated on detail reads, omitted on list reads.
  uptimePercent?: number;
};

export type MaintenanceWindowDTO = {
  id: string;
  terminalId: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  status: MaintenanceWindowDoc["status"];
};

export type TerminalEventDTO = {
  id: string;
  terminalId: string;
  type: TerminalEventDoc["type"];
  at: string;
};

export function serializeTerminal(
  t: ResolvedTerminal,
  uptimePercent?: number,
): TerminalDTO {
  return {
    id: t._id!.toString(),
    partnerId: t.partnerId,
    code: t.code,
    name: t.name,
    venueType: t.venueType,
    address: t.address,
    city: t.city,
    coords: t.coords,
    status: t.status,
    spraysToday: t.spraysToday,
    screenStatus: t.screenStatus,
    lastHeartbeatAt: t.lastHeartbeatAt?.toISOString(),
    installedAt: t.installedAt.toISOString(),
    decommissionedAt: t.decommissionedAt?.toISOString(),
    activeMaintenance: t.activeMaintenance
      ? serializeMaintenanceWindow(t.activeMaintenance)
      : undefined,
    uptimePercent,
  };
}

export function serializeMaintenanceWindow(
  w: MaintenanceWindowDoc,
): MaintenanceWindowDTO {
  return {
    id: w._id!.toString(),
    terminalId: w.terminalId,
    startsAt: w.startsAt.toISOString(),
    endsAt: w.endsAt.toISOString(),
    reason: w.reason,
    status: w.status,
  };
}

export function serializeTerminalEvent(e: TerminalEventDoc): TerminalEventDTO {
  return {
    id: e._id!.toString(),
    terminalId: e.terminalId,
    type: e.type,
    at: e.at.toISOString(),
  };
}
