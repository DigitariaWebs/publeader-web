import type { ReportFormat, ReportType } from "../schemas";

export type ReportPeriod = {
  start: Date;
  end: Date;
};

export type BuildResult = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  format: ReportFormat;
};

export interface ReportBuilder {
  type: ReportType;
  build(period: ReportPeriod): Promise<BuildResult>;
}

// Date ranges in periodEnd are inclusive of the entire end day for queries.
// This helper extends an end-of-day so $lte on createdAt catches the full day.
export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

export function formatPeriodSlug(p: ReportPeriod): string {
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${fmt(p.start)}-${fmt(p.end)}`;
}
