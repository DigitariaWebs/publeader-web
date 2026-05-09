import { ObjectId } from "mongodb";
import { db } from "../db";
import {
  Collections,
  REPORT_TYPE_FORMATS,
  type ReportDoc,
  type ReportType,
} from "../schemas";
import { getBuilder, type ReportPeriod } from "./builders";
import { formatPeriodSlug } from "./types";
import {
  ReportsCloudinaryNotConfiguredError,
  deleteReportFromCloudinary,
  uploadReportToCloudinary,
} from "./upload";

export class ReportError extends Error {
  constructor(
    public readonly code:
      | "invalid_type"
      | "invalid_period"
      | "not_found"
      | "build_failed"
      | "cloudinary_not_configured",
    message: string,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

export type GenerateReportInput = {
  type: ReportType;
  period: ReportPeriod;
  adminId: string;
};

function validatePeriod(p: ReportPeriod): void {
  if (
    !(p.start instanceof Date) ||
    !(p.end instanceof Date) ||
    isNaN(p.start.getTime()) ||
    isNaN(p.end.getTime())
  ) {
    throw new ReportError("invalid_period", "period dates invalid");
  }
  if (p.start.getTime() > p.end.getTime()) {
    throw new ReportError(
      "invalid_period",
      "period start must be on or before end",
    );
  }
}

export async function generateReport(
  input: GenerateReportInput,
): Promise<ReportDoc> {
  validatePeriod(input.period);
  const builder = getBuilder(input.type);
  if (!builder) throw new ReportError("invalid_type", `unknown type ${input.type}`);

  let buildOutput;
  try {
    buildOutput = await builder.build(input.period);
  } catch (e) {
    throw new ReportError(
      "build_failed",
      e instanceof Error ? e.message : String(e),
    );
  }

  const slug = formatPeriodSlug(input.period);
  const publicId = `reports/${input.type}-${slug}-${Date.now()}`;

  let upload;
  try {
    upload = await uploadReportToCloudinary({
      buffer: buildOutput.buffer,
      publicId,
      format: buildOutput.format,
    });
  } catch (e) {
    if (e instanceof ReportsCloudinaryNotConfiguredError) {
      throw new ReportError("cloudinary_not_configured", e.message);
    }
    throw e;
  }

  const now = new Date();
  const doc: ReportDoc = {
    type: input.type,
    periodStart: input.period.start,
    periodEnd: input.period.end,
    format: REPORT_TYPE_FORMATS[input.type],
    filename: buildOutput.filename,
    cloudinaryUrl: upload.url,
    cloudinaryPublicId: upload.publicId,
    byteSize: upload.bytes,
    requestedBy: input.adminId,
    requestedAt: now,
  };
  const result = await db.collection(Collections.reports).insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function listReports(filter: {
  type?: ReportType;
} = {}): Promise<ReportDoc[]> {
  const q: Record<string, unknown> = {};
  if (filter.type) q.type = filter.type;
  return (await db
    .collection(Collections.reports)
    .find(q)
    .sort({ requestedAt: -1 })
    .toArray()) as ReportDoc[];
}

export async function getReport(id: string): Promise<ReportDoc> {
  if (!ObjectId.isValid(id)) {
    throw new ReportError("not_found", "report not found");
  }
  const doc = (await db
    .collection(Collections.reports)
    .findOne({ _id: new ObjectId(id) })) as ReportDoc | null;
  if (!doc) throw new ReportError("not_found", "report not found");
  return doc;
}

export async function deleteReport(id: string): Promise<void> {
  const doc = await getReport(id);
  await deleteReportFromCloudinary(doc.cloudinaryPublicId);
  await db
    .collection(Collections.reports)
    .deleteOne({ _id: new ObjectId(id) });
}
