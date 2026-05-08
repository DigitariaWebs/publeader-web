import { ObjectId } from "mongodb";

export type ValidationStatus = "pending" | "validated" | "rejected";
export type UserRoleName =
  | "admin"
  | "advertiser"
  | "driver"
  | "partner"
  | "team_member";

export type BankAccount = {
  iban: string;
  bankName?: string;
  accountHolder?: string;
};

export type DriverDoc = {
  _id?: ObjectId;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  status: ValidationStatus;
  joinedAt: Date;
  campaignsDone: number;
  rating: number;
  totalKm: number;
  // All monetary values stored in cents to avoid float math.
  totalEarningsCents: number;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  withdrawnTotalCents: number;
  bankAccount?: BankAccount;
  // True only when every required document type has been admin-approved.
  documentsApproved: boolean;
  // Last time the driver changed their city (used to enforce a cooldown).
  cityChangedAt?: Date;
};

export const CITY_CHANGE_COOLDOWN_HOURS = 48;

// --- Vehicles ---

export type VehicleType = "Berline" | "SUV" | "Utilitaire" | "Autre";

export type InspectionInfo = {
  // Date the technical inspection ("contrôle technique") expires.
  expiresAt?: Date;
  // Optional Cloudinary file ref for the inspection certificate.
  fileUrl?: string;
  filePublicId?: string;
};

export type VehicleDoc = {
  _id?: ObjectId;
  driverId: string;
  make: string; // e.g. "Audi"
  model: string; // e.g. "Q5"
  year: string; // stored as string for flexibility ("2022")
  licensePlate: string; // normalized uppercase
  type: VehicleType;
  isActive: boolean;
  inspection?: InspectionInfo;
  // Showcase gallery (separate from D4 KYC vehicle_photos).
  photos: FileMeta[];
  createdAt: Date;
  updatedAt: Date;
};

export const VEHICLE_MAX_PER_DRIVER = 3;
export const VEHICLE_PHOTOS_MAX = 10;

export type CompanyDoc = {
  _id?: ObjectId;
  userId: string;
  organizationId?: string;
  companyName: string;
  contactName: string;
  phone: string;
  domain: string;
  sector: string;
  city: string;
  website?: string;
  description?: string;
  status: ValidationStatus;
  founded?: string;
  headquarters?: string;
  budgetTotal: number;
  employees?: string;
  campaignsCount: number;
  // Brand identity
  brandColor?: string; // hex like #FF5733
  logo?: {
    publicId: string; // Cloudinary public_id (used for delete)
    url: string;
    bytes: number;
  };
  // Legacy plain string still supported as read-only fallback for old data.
  logoUrl?: string;
  // Legal info (French invoicing fields)
  legalName?: string;
  siret?: string;
  vatNumber?: string;
  legalForm?: "SARL" | "SAS" | "SA" | "EURL" | "Auto-entrepreneur" | "Autre";
  createdAt: Date;
};

export const COMPANY_LEGAL_FORMS = [
  "SARL",
  "SAS",
  "SA",
  "EURL",
  "Auto-entrepreneur",
  "Autre",
] as const;

export type PartnerDoc = {
  _id?: ObjectId;
  userId: string;
  businessName: string;
  managerName: string;
  phone: string;
  address: string;
  city: string;
  openingHours?: string;
  monthlySprayRevenue: number;
  monthlyAdsRevenue: number;
  status: ValidationStatus;
  createdAt: Date;
};

export type CampaignStatus =
  | "draft"
  | "upcoming"
  | "active"
  | "completed";

export type TrackingMode = "gps" | "manual";

export type CampaignType = "flocage" | "borne";

export type BudgetTier = "boost" | "growth" | "leader";

export const BUDGET_TIERS: BudgetTier[] = ["boost", "growth", "leader"];

// Suggested defaults shown in the wizard when an advertiser picks a tier.
// Values are presets only — advertisers may override every field below.
export const BUDGET_TIER_PRESETS: Record<
  BudgetTier,
  {
    label: string;
    budgetCents: number;
    durationDays: number;
    flocageDrivers: number;
    flocageRewardCents: number;
    borneCount: number;
    borneTargetImpressions: number;
  }
> = {
  boost: {
    label: "BOOST",
    budgetCents: 150_000, // 1500 €
    durationDays: 14,
    flocageDrivers: 3,
    flocageRewardCents: 30_000, // 300 € / driver
    borneCount: 2,
    borneTargetImpressions: 10_000,
  },
  growth: {
    label: "GROWTH",
    budgetCents: 500_000, // 5000 €
    durationDays: 30,
    flocageDrivers: 8,
    flocageRewardCents: 50_000, // 500 €
    borneCount: 5,
    borneTargetImpressions: 30_000,
  },
  leader: {
    label: "LEADER",
    budgetCents: 1_200_000, // 12000 €
    durationDays: 60,
    flocageDrivers: 20,
    flocageRewardCents: 50_000,
    borneCount: 12,
    borneTargetImpressions: 100_000,
  },
};

export type BorneCampaignFields = {
  count: number;
  targetImpressions: number;
  // Optional pre-assigned terminals (filled by admin/partner ops, not wizard).
  terminalIds?: string[];
};

export type CampaignDoc = {
  _id?: ObjectId;
  companyId: string;
  brand: string;
  domain: string;
  title: string;
  description: string;
  // Discriminator. Existing pre-A4 docs default to "flocage" on read.
  campaignType: CampaignType;
  // Pricing tier picked at creation. Stored for analytics + admin views.
  budgetTier: BudgetTier;
  // Total billed amount, in cents. Independent from per-driver reward.
  budgetCents: number;
  city: string;
  zones: string[];
  startDate: Date;
  endDate: Date;
  durationDays: number;
  // Reward per assigned driver, stored in cents. Always 0 for borne.
  rewardCents: number;
  status: CampaignStatus;
  progress: number;
  kmDone: number;
  kmTotal: number;
  driversNeeded: number;
  driversAssigned: number;
  assignedDriverIds: string[];
  trackingMode: TrackingMode;
  heroImageUrl?: string;
  // Asset references owned by the same company. Populated by the campaign
  // creation wizard (A4); A3 reads aggregate counts off this field.
  assetIds?: string[];
  // Borne-specific fields. Required when campaignType === "borne", absent
  // otherwise.
  borne?: BorneCampaignFields;
  createdAt: Date;
  updatedAt: Date;
};

// Fields whose mutation requires the campaign to still be a draft. Editing
// them after publish would change a commercial commitment.
export const CAMPAIGN_LOCKED_AFTER_PUBLISH = [
  "campaignType",
  "city",
  "startDate",
  "budgetTier",
  "budgetCents",
  "rewardCents",
  "driversNeeded",
  "borne",
] as const;

// --- Advertiser asset library (A3) ---

export type AssetType = "visual" | "video" | "logo" | "brief";

export const ASSET_TYPES: AssetType[] = ["visual", "video", "logo", "brief"];

// Cloudinary upload limits per asset type (bytes). Enforced at /api/me/assets
// POST (after upload) and reflected in the UI hint.
export const ASSET_MAX_BYTES: Record<AssetType, number> = {
  visual: 10 * 1024 * 1024, // 10 MB
  logo: 5 * 1024 * 1024, //  5 MB
  brief: 20 * 1024 * 1024, // 20 MB
  video: 100 * 1024 * 1024, // 100 MB
};

// Allowed Cloudinary resource_type per asset type — server rejects mismatches.
export const ASSET_RESOURCE_TYPES: Record<AssetType, ("image" | "video" | "raw")[]> = {
  visual: ["image"],
  logo: ["image"],
  video: ["video"],
  brief: ["raw", "image"], // pdfs come back as 'raw' from Cloudinary
};

export type AssetDoc = {
  _id?: ObjectId;
  companyId: string;
  type: AssetType;
  name: string;
  file: FileMeta & {
    duration?: number; // for videos
  };
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignEventType =
  | "accept"
  | "cancel"
  | "complete"
  | "status_change";

export type CampaignEventDoc = {
  _id?: ObjectId;
  campaignId: string;
  type: CampaignEventType;
  driverId?: string;
  at: Date;
  meta?: Record<string, unknown>;
};

export type TransactionType =
  | "campaign_completion"
  | "withdrawal_debit"
  | "withdrawal_refund"
  | "adjustment";

// Settlement applies only to campaign_completion: amounts are 'pending' until
// the holdDays window passes, then become 'available' on read.
// Withdrawal debits are always available-tier (already deducted at request).
export type TransactionTier = "pending" | "available";

export type TransactionDoc = {
  _id?: ObjectId;
  driverId: string;
  type: TransactionType;
  amountCents: number; // signed: credits positive, debits negative
  tier: TransactionTier;
  // Date amount becomes 'available'. For pending campaign credits this is
  // createdAt + holdDays; for instant entries it equals createdAt.
  availableAt: Date;
  createdAt: Date;
  // Linked context, depending on type
  campaignId?: string;
  withdrawalId?: string;
  description: string;
  meta?: Record<string, unknown>;
};

export type WithdrawalStatus =
  | "pending"
  | "paid"
  | "rejected";

export type WithdrawalDoc = {
  _id?: ObjectId;
  driverId: string;
  amountCents: number; // always positive
  status: WithdrawalStatus;
  iban: string;
  bankName?: string;
  accountHolder?: string;
  debitTransactionId: string;
  refundTransactionId?: string;
  createdAt: Date;
  processedAt?: Date;
  processedBy?: string; // admin user id
  rejectReason?: string;
  payoutReference?: string; // admin's bank reference once paid
};

export type AppConfigDoc = {
  _id?: ObjectId;
  key: "payments";
  withdrawalMinCents: number;
  pendingHoldDays: number;
  updatedAt: Date;
};

// --- Documents (KYC) ---

export type DocumentType =
  | "license"
  | "registration"
  | "insurance"
  | "rib"
  | "vehicle_photos";

export type DocumentStatus = "missing" | "pending" | "approved" | "rejected";

export type FileMeta = {
  publicId: string; // Cloudinary public_id (used for delete)
  url: string; // secure_url
  resourceType: "image" | "raw" | "video";
  format?: string;
  bytes: number;
  width?: number;
  height?: number;
  uploadedAt: Date;
};

export type DocumentDoc = {
  _id?: ObjectId;
  driverId: string;
  type: DocumentType;
  status: DocumentStatus;
  files: FileMeta[];
  // Approval/reject metadata (last action only — re-upload clears reject).
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Required count per type — drives UI hints and admin completeness checks.
export const DOC_TYPE_META: Record<
  DocumentType,
  { label: string; requiredCount: number; description: string }
> = {
  license: {
    label: "Permis de conduire",
    requiredCount: 2, // recto + verso
    description: "Recto et verso de votre permis.",
  },
  registration: {
    label: "Carte grise",
    requiredCount: 2,
    description: "Recto et verso de la carte grise du véhicule.",
  },
  insurance: {
    label: "Attestation d'assurance",
    requiredCount: 1,
    description: "Attestation à jour, période en cours visible.",
  },
  rib: {
    label: "RIB bancaire",
    requiredCount: 1,
    description: "Relevé d'identité bancaire au nom du chauffeur.",
  },
  vehicle_photos: {
    label: "Photos du véhicule",
    requiredCount: 4,
    description: "Avant, arrière, côté gauche, côté droit.",
  },
};

export const REQUIRED_DOC_TYPES: DocumentType[] = [
  "license",
  "registration",
  "insurance",
  "rib",
  "vehicle_photos",
];

// --- Terminals (P2 — Bornes) ---

export type TerminalStatus = "online" | "offline" | "maintenance";

export type VenueType =
  | "bar"
  | "restaurant"
  | "hotel"
  | "nightclub"
  | "gym"
  | "other";

export const VENUE_TYPES: VenueType[] = [
  "bar",
  "restaurant",
  "hotel",
  "nightclub",
  "gym",
  "other",
];

export type ScreenStatus = "active" | "idle" | "fault";

export type TerminalDoc = {
  _id?: ObjectId;
  partnerId: string; // FK to PartnerDoc._id
  code: string; // Human-readable id (e.g. "B-PR-019-03"). Unique.
  name: string; // Venue display name (e.g. "Le Sélect")
  venueType: VenueType;
  address: string;
  city: string;
  coords: { lat: number; lng: number };
  // Bcrypt hash of the device API key. Raw key shown once at creation.
  apiKeyHash: string;
  // Last heartbeat snapshot
  lastHeartbeatAt?: Date;
  // Persisted status. Reflects what was true at the last resolver run (read or
  // heartbeat). Reads call resolveTerminalStatus() which may flip this.
  lastKnownStatus: TerminalStatus;
  spraysToday: number;
  screenStatus: ScreenStatus;
  // Lifecycle
  installedAt: Date;
  decommissionedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type TerminalEventType =
  | "online"
  | "offline"
  | "maintenance_start"
  | "maintenance_end";

export type TerminalEventDoc = {
  _id?: ObjectId;
  terminalId: string;
  type: TerminalEventType;
  at: Date;
  meta?: Record<string, unknown>;
};

export type MaintenanceWindowStatus =
  | "scheduled"
  | "active"
  | "done"
  | "cancelled";

export type MaintenanceWindowDoc = {
  _id?: ObjectId;
  terminalId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  status: MaintenanceWindowStatus;
  createdBy: string; // admin userId
  createdAt: Date;
};

// Heartbeat older than this threshold flips the terminal to "offline".
export const TERMINAL_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

// Per-terminal API key length (raw bytes -> hex).
export const TERMINAL_API_KEY_BYTES = 32;

export const Collections = {
  drivers: "drivers",
  companies: "companies",
  partners: "partners",
  campaigns: "campaigns",
  campaignEvents: "campaign_events",
  transactions: "transactions",
  withdrawals: "withdrawals",
  appConfig: "app_config",
  documents: "documents",
  vehicles: "vehicles",
  assets: "assets",
  terminals: "terminals",
  terminalEvents: "terminal_events",
  maintenanceWindows: "maintenance_windows",
} as const;
