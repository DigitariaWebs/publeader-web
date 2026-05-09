import {
  REPORT_TYPE_LABELS,
  type ReportDoc,
  type ReportFormat,
  type ReportType,
} from "./schemas";

export type ReportDTO = {
  id: string;
  type: ReportType;
  typeLabel: string;
  format: ReportFormat;
  filename: string;
  periodStart: string;
  periodEnd: string;
  url: string;
  byteSize: number;
  requestedBy: string;
  requestedAt: string;
};

export function serializeReport(r: ReportDoc): ReportDTO {
  return {
    id: r._id!.toString(),
    type: r.type,
    typeLabel: REPORT_TYPE_LABELS[r.type],
    format: r.format,
    filename: r.filename,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    url: r.cloudinaryUrl,
    byteSize: r.byteSize,
    requestedBy: r.requestedBy,
    requestedAt: r.requestedAt.toISOString(),
  };
}
