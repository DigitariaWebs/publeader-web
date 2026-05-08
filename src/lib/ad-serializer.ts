import type {
  AdImpressionDailyDoc,
  AdIssueReportDoc,
  AdScheduleDoc,
  AdScheduleStatus,
} from "./schemas";
import type { ResolvedSchedule } from "./ad-schedule-service";

export type AdScheduleDTO = {
  id: string;
  terminalId: string;
  campaignId: string;
  partnerId: string;
  companyId: string;
  startHour: number;
  endHour: number;
  intervalSeconds: number;
  /** Stored status (paused/cancelled/etc). Use liveStatus for what to show. */
  status: AdScheduleStatus;
  /** Computed status considering campaign lifecycle. */
  liveStatus: AdScheduleStatus;
  inWindowNow: boolean;
  pausedAt?: string;
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
  // Optional joined fields populated by route handlers.
  campaignTitle?: string;
  campaignBrand?: string;
  campaignBrandColor?: string;
  campaignType?: string;
  campaignStartDate?: string;
  campaignEndDate?: string;
  terminalName?: string;
  terminalCode?: string;
};

export type AdImpressionDailyDTO = {
  terminalId: string;
  campaignId: string;
  date: string;
  impressions: number;
};

export type AdIssueReportDTO = {
  id: string;
  partnerId: string;
  terminalId: string;
  scheduleId: string;
  campaignId: string;
  kind: AdIssueReportDoc["kind"];
  description: string;
  status: AdIssueReportDoc["status"];
  createdAt: string;
  resolvedAt?: string;
  resolution?: string;
  // Optional joined fields.
  campaignTitle?: string;
  terminalName?: string;
};

export function serializeSchedule(
  r: ResolvedSchedule,
  joins?: {
    campaignTitle?: string;
    campaignBrand?: string;
    campaignBrandColor?: string;
    campaignType?: string;
    campaignStartDate?: Date;
    campaignEndDate?: Date;
    terminalName?: string;
    terminalCode?: string;
  },
): AdScheduleDTO {
  return {
    id: r._id!.toString(),
    terminalId: r.terminalId,
    campaignId: r.campaignId,
    partnerId: r.partnerId,
    companyId: r.companyId,
    startHour: r.startHour,
    endHour: r.endHour,
    intervalSeconds: r.intervalSeconds,
    status: r.status,
    liveStatus: r.liveStatus,
    inWindowNow: r.inWindowNow,
    pausedAt: r.pausedAt?.toISOString(),
    pauseReason: r.pauseReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    campaignTitle: joins?.campaignTitle,
    campaignBrand: joins?.campaignBrand,
    campaignBrandColor: joins?.campaignBrandColor,
    campaignType: joins?.campaignType,
    campaignStartDate: joins?.campaignStartDate?.toISOString(),
    campaignEndDate: joins?.campaignEndDate?.toISOString(),
    terminalName: joins?.terminalName,
    terminalCode: joins?.terminalCode,
  };
}

export function serializeImpressionDaily(
  d: AdImpressionDailyDoc,
): AdImpressionDailyDTO {
  return {
    terminalId: d.terminalId,
    campaignId: d.campaignId,
    date: d.date,
    impressions: d.impressions,
  };
}

export function serializeIssue(
  r: AdIssueReportDoc,
  joins?: { campaignTitle?: string; terminalName?: string },
): AdIssueReportDTO {
  return {
    id: r._id!.toString(),
    partnerId: r.partnerId,
    terminalId: r.terminalId,
    scheduleId: r.scheduleId,
    campaignId: r.campaignId,
    kind: r.kind,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString(),
    resolution: r.resolution,
    campaignTitle: joins?.campaignTitle,
    terminalName: joins?.terminalName,
  };
}
