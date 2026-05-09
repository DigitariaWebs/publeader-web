import type { ReportType } from "../../schemas";
import type { ReportBuilder } from "../types";
export type { ReportPeriod } from "../types";

import { monthlySummaryBuilder } from "./monthly-summary";
import { accountingExportBuilder } from "./accounting-export";
import { bornePerformanceBuilder } from "./borne-performance";
import { driverActivityBuilder } from "./driver-activity";
import { advertiserEngagementBuilder } from "./advertiser-engagement";
import { gdprAuditBuilder } from "./gdpr-audit";

const BUILDERS: Record<ReportType, ReportBuilder> = {
  monthly_summary: monthlySummaryBuilder,
  accounting_export: accountingExportBuilder,
  borne_performance: bornePerformanceBuilder,
  driver_activity: driverActivityBuilder,
  advertiser_engagement: advertiserEngagementBuilder,
  gdpr_audit: gdprAuditBuilder,
};

export function getBuilder(type: ReportType): ReportBuilder | undefined {
  return BUILDERS[type];
}
