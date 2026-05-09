/**
 * AD1 — Validations queue service.
 *
 * Unified surface over driver/company/partner approval. Last-action-only
 * audit trail (no append log). Driver overall approve gated by
 * documentsApproved (D4 KYC must be complete first). Companies/partners
 * pass through to overall approve directly. Email sent on every action.
 */
import { ObjectId } from "mongodb";
import { db } from "./db";
import {
  Collections,
  type CompanyDoc,
  type DriverDoc,
  type PartnerDoc,
  type ValidationKind,
  type ValidationRejectReason,
  type ValidationStatus,
  VALIDATION_REJECT_REASONS,
} from "./schemas";
import { sendMail } from "./mailer";

type EntityDoc = DriverDoc | CompanyDoc | PartnerDoc;

type UserSummary = { email: string; name?: string };

export type ValidationQueueItem = {
  id: string;
  kind: ValidationKind;
  name: string;
  email: string;
  city?: string;
  status: ValidationStatus;
  submittedAt: string; // ISO
  reviewedAt?: string;
  // Per-kind compact summary (drivers: doc completeness; companies: sector; partners: business name).
  summary?: {
    docsCompleted?: number;
    docsRequired?: number;
    documentsApproved?: boolean;
    sector?: string;
    legalForm?: string;
    venueAddress?: string;
  };
};

export class ValidationServiceError extends Error {
  constructor(
    public code:
      | "not_found"
      | "invalid_kind"
      | "documents_not_approved"
      | "invalid_reason"
      | "missing_message"
      | "already_in_state",
    message: string,
  ) {
    super(message);
  }
}

function collectionFor(kind: ValidationKind) {
  if (kind === "driver") return Collections.drivers;
  if (kind === "company") return Collections.companies;
  if (kind === "partner") return Collections.partners;
  throw new ValidationServiceError("invalid_kind", `unknown kind: ${kind}`);
}

function nameOf(kind: ValidationKind, e: EntityDoc): string {
  if (kind === "driver") {
    const d = e as DriverDoc;
    return `${d.firstName} ${d.lastName}`.trim();
  }
  if (kind === "company") return (e as CompanyDoc).companyName;
  return (e as PartnerDoc).businessName;
}

function userIdOf(e: EntityDoc): string {
  return e.userId;
}

async function loadUserMap(userIds: string[]): Promise<Map<string, UserSummary>> {
  if (!userIds.length) return new Map();
  const ids = Array.from(new Set(userIds));
  // Better Auth user collection may store _id as ObjectId or string depending
  // on adapter version, so query both.
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const users = (await db
    .collection("user")
    .find({
      $or: [{ _id: { $in: objectIds } }, { _id: { $in: ids } }],
    } as never)
    .project({ email: 1, name: 1 })
    .toArray()) as Array<{ _id: ObjectId | string; email: string; name?: string }>;
  return new Map(
    users.map((u) => [
      typeof u._id === "string" ? u._id : u._id.toString(),
      { email: u.email, name: u.name },
    ]),
  );
}

async function loadEntity(
  kind: ValidationKind,
  id: string,
): Promise<EntityDoc> {
  if (!ObjectId.isValid(id)) {
    throw new ValidationServiceError("not_found", "invalid id");
  }
  const doc = (await db
    .collection(collectionFor(kind))
    .findOne({ _id: new ObjectId(id) })) as EntityDoc | null;
  if (!doc) throw new ValidationServiceError("not_found", `${kind} not found`);
  return doc;
}

export async function getQueue(opts: {
  status?: ValidationStatus;
  kind?: ValidationKind;
}): Promise<ValidationQueueItem[]> {
  const status = opts.status ?? "pending";
  const kinds: ValidationKind[] = opts.kind ? [opts.kind] : ["driver", "company", "partner"];

  const items: ValidationQueueItem[] = [];
  // Drivers
  if (kinds.includes("driver")) {
    const drivers = (await db
      .collection(Collections.drivers)
      .find({ status })
      .sort({ joinedAt: -1 })
      .toArray()) as DriverDoc[];
    const userMap = await loadUserMap(drivers.map(userIdOf));
    for (const d of drivers) {
      const u = userMap.get(d.userId);
      const docs = (await db
        .collection(Collections.documents)
        .countDocuments({ driverId: d._id!.toString(), status: "approved" }));
      items.push({
        id: d._id!.toString(),
        kind: "driver",
        name: nameOf("driver", d),
        email: u?.email ?? "",
        city: d.city,
        status: d.status,
        submittedAt: d.joinedAt.toISOString(),
        reviewedAt: d.validation?.reviewedAt?.toISOString(),
        summary: {
          docsCompleted: docs,
          docsRequired: 5, // REQUIRED_DOC_TYPES.length
          documentsApproved: d.documentsApproved,
        },
      });
    }
  }
  // Companies
  if (kinds.includes("company")) {
    const companies = (await db
      .collection(Collections.companies)
      .find({ status })
      .sort({ createdAt: -1 })
      .toArray()) as CompanyDoc[];
    const userMap = await loadUserMap(companies.map(userIdOf));
    for (const c of companies) {
      const u = userMap.get(c.userId);
      items.push({
        id: c._id!.toString(),
        kind: "company",
        name: nameOf("company", c),
        email: u?.email ?? "",
        city: c.city,
        status: c.status,
        submittedAt: c.createdAt.toISOString(),
        reviewedAt: c.validation?.reviewedAt?.toISOString(),
        summary: {
          sector: c.sector,
          legalForm: c.legalForm,
        },
      });
    }
  }
  // Partners
  if (kinds.includes("partner")) {
    const partners = (await db
      .collection(Collections.partners)
      .find({ status })
      .sort({ createdAt: -1 })
      .toArray()) as PartnerDoc[];
    const userMap = await loadUserMap(partners.map(userIdOf));
    for (const p of partners) {
      const u = userMap.get(p.userId);
      items.push({
        id: p._id!.toString(),
        kind: "partner",
        name: nameOf("partner", p),
        email: u?.email ?? "",
        city: p.city,
        status: p.status,
        submittedAt: p.createdAt.toISOString(),
        reviewedAt: p.validation?.reviewedAt?.toISOString(),
        summary: {
          venueAddress: p.address,
        },
      });
    }
  }
  // Sort combined by submittedAt desc.
  items.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return items;
}

export type ValidationDetail = {
  id: string;
  kind: ValidationKind;
  status: ValidationStatus;
  user: { id: string; email: string; name?: string };
  submittedAt: string;
  validation?: {
    reviewedBy?: string;
    reviewedAt?: string;
    rejection?: { reason: ValidationRejectReason; note?: string };
    lastInfoRequest?: {
      message: string;
      requestedBy: string;
      requestedAt: string;
    };
  };
  // Kind-specific payload.
  driver?: {
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    documentsApproved: boolean;
    documents: Array<{
      id: string;
      type: string;
      typeLabel: string;
      status: string;
      files: Array<{ url: string; resourceType: string; uploadedAt: string }>;
      rejectReason?: string;
    }>;
  };
  company?: {
    companyName: string;
    contactName: string;
    phone: string;
    domain: string;
    sector: string;
    city: string;
    legalName?: string;
    siret?: string;
    vatNumber?: string;
    legalForm?: string;
    website?: string;
    description?: string;
    logoUrl?: string;
  };
  partner?: {
    businessName: string;
    managerName: string;
    phone: string;
    address: string;
    city: string;
    openingHours?: string;
  };
};

export async function getDetail(
  kind: ValidationKind,
  id: string,
): Promise<ValidationDetail> {
  const e = await loadEntity(kind, id);
  const userMap = await loadUserMap([e.userId]);
  const u = userMap.get(e.userId);

  const submittedAt =
    kind === "driver"
      ? (e as DriverDoc).joinedAt
      : kind === "company"
        ? (e as CompanyDoc).createdAt
        : (e as PartnerDoc).createdAt;

  const detail: ValidationDetail = {
    id: e._id!.toString(),
    kind,
    status: e.status,
    user: {
      id: e.userId,
      email: u?.email ?? "",
      name: u?.name,
    },
    submittedAt: submittedAt.toISOString(),
    validation: e.validation
      ? {
          reviewedBy: e.validation.reviewedBy,
          reviewedAt: e.validation.reviewedAt?.toISOString(),
          rejection: e.validation.rejection,
          lastInfoRequest: e.validation.lastInfoRequest
            ? {
                message: e.validation.lastInfoRequest.message,
                requestedBy: e.validation.lastInfoRequest.requestedBy,
                requestedAt:
                  e.validation.lastInfoRequest.requestedAt.toISOString(),
              }
            : undefined,
        }
      : undefined,
  };

  if (kind === "driver") {
    const d = e as DriverDoc;
    const documents = (await db
      .collection(Collections.documents)
      .find({ driverId: d._id!.toString() })
      .sort({ updatedAt: -1 })
      .toArray()) as Array<{
      _id: ObjectId;
      type: string;
      status: string;
      files: Array<{
        url: string;
        resourceType: string;
        uploadedAt: Date;
      }>;
      rejectReason?: string;
    }>;
    const { DOC_TYPE_META } = await import("./schemas");
    detail.driver = {
      firstName: d.firstName,
      lastName: d.lastName,
      phone: d.phone,
      city: d.city,
      documentsApproved: d.documentsApproved,
      documents: documents.map((doc) => ({
        id: doc._id.toString(),
        type: doc.type,
        typeLabel:
          DOC_TYPE_META[doc.type as keyof typeof DOC_TYPE_META]?.label ??
          doc.type,
        status: doc.status,
        files: doc.files.map((f) => ({
          url: f.url,
          resourceType: f.resourceType,
          uploadedAt: f.uploadedAt.toISOString(),
        })),
        rejectReason: doc.rejectReason,
      })),
    };
  } else if (kind === "company") {
    const c = e as CompanyDoc;
    detail.company = {
      companyName: c.companyName,
      contactName: c.contactName,
      phone: c.phone,
      domain: c.domain,
      sector: c.sector,
      city: c.city,
      legalName: c.legalName,
      siret: c.siret,
      vatNumber: c.vatNumber,
      legalForm: c.legalForm,
      website: c.website,
      description: c.description,
      logoUrl: c.logo?.url ?? c.logoUrl,
    };
  } else {
    const p = e as PartnerDoc;
    detail.partner = {
      businessName: p.businessName,
      managerName: p.managerName,
      phone: p.phone,
      address: p.address,
      city: p.city,
      openingHours: p.openingHours,
    };
  }

  return detail;
}

async function notifyDecision(opts: {
  kind: ValidationKind;
  email: string;
  recipientName: string;
  decision: "approved" | "rejected" | "info_requested";
  reasonLabel?: string;
  note?: string;
  message?: string;
}) {
  if (!opts.email) return;
  const kindFr =
    opts.kind === "driver"
      ? "chauffeur"
      : opts.kind === "company"
        ? "entreprise"
        : "partenaire";
  if (opts.decision === "approved") {
    await sendMail({
      to: opts.email,
      subject: `Votre dossier ${kindFr} est validé`,
      text:
        `Bonjour ${opts.recipientName},\n\n` +
        `Votre dossier a été validé. Vous pouvez désormais accéder à votre espace ${kindFr}.\n\n` +
        `— L'équipe Publeader`,
    });
  } else if (opts.decision === "rejected") {
    await sendMail({
      to: opts.email,
      subject: `Votre dossier ${kindFr} a été refusé`,
      text:
        `Bonjour ${opts.recipientName},\n\n` +
        `Votre dossier a été refusé pour la raison suivante : ${opts.reasonLabel}.\n` +
        (opts.note ? `\nNote de l'administrateur :\n${opts.note}\n` : "") +
        `\nVous pouvez nous contacter pour en discuter.\n\n— L'équipe Publeader`,
    });
  } else {
    await sendMail({
      to: opts.email,
      subject: `Informations supplémentaires demandées`,
      text:
        `Bonjour ${opts.recipientName},\n\n` +
        `Pour finaliser votre dossier, nous avons besoin de précisions :\n\n` +
        `${opts.message}\n\n` +
        `Merci de mettre à jour votre dossier dès que possible.\n\n— L'équipe Publeader`,
    });
  }
}

async function getEmailAndName(
  e: EntityDoc,
  kind: ValidationKind,
): Promise<{ email: string; name: string }> {
  const userMap = await loadUserMap([e.userId]);
  const u = userMap.get(e.userId);
  return {
    email: u?.email ?? "",
    name: u?.name ?? nameOf(kind, e),
  };
}

export async function approve(
  kind: ValidationKind,
  id: string,
  adminId: string,
): Promise<EntityDoc> {
  const e = await loadEntity(kind, id);
  if (e.status === "validated") {
    throw new ValidationServiceError(
      "already_in_state",
      "already validated",
    );
  }
  if (kind === "driver" && !(e as DriverDoc).documentsApproved) {
    throw new ValidationServiceError(
      "documents_not_approved",
      "all driver documents must be approved before overall approval",
    );
  }
  const now = new Date();
  await db.collection(collectionFor(kind)).updateOne(
    { _id: e._id! },
    {
      $set: {
        status: "validated",
        "validation.reviewedBy": adminId,
        "validation.reviewedAt": now,
      },
      $unset: {
        "validation.rejection": "",
        "validation.lastInfoRequest": "",
      },
    },
  );
  const { email, name } = await getEmailAndName(e, kind);
  await notifyDecision({
    kind,
    email,
    recipientName: name,
    decision: "approved",
  });
  return loadEntity(kind, id);
}

export async function reject(
  kind: ValidationKind,
  id: string,
  reason: ValidationRejectReason,
  note: string | undefined,
  adminId: string,
): Promise<EntityDoc> {
  if (!VALIDATION_REJECT_REASONS.includes(reason)) {
    throw new ValidationServiceError("invalid_reason", `bad reason: ${reason}`);
  }
  const e = await loadEntity(kind, id);
  const now = new Date();
  await db.collection(collectionFor(kind)).updateOne(
    { _id: e._id! },
    {
      $set: {
        status: "rejected",
        "validation.reviewedBy": adminId,
        "validation.reviewedAt": now,
        "validation.rejection": { reason, ...(note ? { note } : {}) },
      },
      $unset: {
        "validation.lastInfoRequest": "",
      },
    },
  );
  const { email, name } = await getEmailAndName(e, kind);
  const { VALIDATION_REJECT_REASON_LABELS } = await import("./schemas");
  await notifyDecision({
    kind,
    email,
    recipientName: name,
    decision: "rejected",
    reasonLabel: VALIDATION_REJECT_REASON_LABELS[reason],
    note,
  });
  return loadEntity(kind, id);
}

export async function requestInfo(
  kind: ValidationKind,
  id: string,
  message: string,
  adminId: string,
): Promise<EntityDoc> {
  const trimmed = message?.trim();
  if (!trimmed) {
    throw new ValidationServiceError(
      "missing_message",
      "message is required",
    );
  }
  const e = await loadEntity(kind, id);
  const now = new Date();
  // Stays in pending; persists the info request only.
  await db.collection(collectionFor(kind)).updateOne(
    { _id: e._id! },
    {
      $set: {
        "validation.lastInfoRequest": {
          message: trimmed,
          requestedBy: adminId,
          requestedAt: now,
        },
      },
    },
  );
  const { email, name } = await getEmailAndName(e, kind);
  await notifyDecision({
    kind,
    email,
    recipientName: name,
    decision: "info_requested",
    message: trimmed,
  });
  return loadEntity(kind, id);
}
