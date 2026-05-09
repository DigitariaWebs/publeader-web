import { v2 as cloudinary } from "cloudinary";
import type { ReportFormat } from "../schemas";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) {
    throw new ReportsCloudinaryNotConfiguredError();
  }
  cloudinary.config({
    cloud_name: cloud,
    api_key: key,
    api_secret: secret,
    secure: true,
  });
  configured = true;
}

export class ReportsCloudinaryNotConfiguredError extends Error {
  constructor() {
    super(
      "Cloudinary not configured: set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET",
    );
    this.name = "ReportsCloudinaryNotConfiguredError";
  }
}

const FORMAT_EXT: Record<ReportFormat, string> = {
  pdf: "pdf",
  csv: "csv",
  zip: "zip",
};

export type ReportUploadResult = {
  url: string;
  publicId: string;
  bytes: number;
};

// Uploads a generated report to Cloudinary as a `raw` resource. PDF/CSV/ZIP
// all need raw because Cloudinary's image/video pipelines reject them. We
// embed the format extension in the public_id so the secure URL ends in
// .pdf/.csv/.zip and browsers download it with the right extension.
export async function uploadReportToCloudinary(args: {
  buffer: Buffer;
  publicId: string; // e.g. "reports/monthly_summary-20260301-20260331-1715000000"
  format: ReportFormat;
}): Promise<ReportUploadResult> {
  ensureConfigured();
  const fullPublicId = `${args.publicId}.${FORMAT_EXT[args.format]}`;

  return new Promise<ReportUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        public_id: fullPublicId,
        overwrite: false,
        type: "upload",
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result) return reject(new Error("Cloudinary returned empty result"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
        });
      },
    );
    stream.end(args.buffer);
  });
}

export async function deleteReportFromCloudinary(publicId: string): Promise<void> {
  ensureConfigured();
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      invalidate: true,
    });
  } catch (e) {
    // Best-effort: orphan asset is preferable to failing the deletion request.
    console.warn(`[reports] cloudinary destroy failed for ${publicId}`, e);
  }
}
