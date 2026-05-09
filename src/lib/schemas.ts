import { ObjectId } from "mongodb";

export type ValidationStatus = "pending" | "validated" | "rejected";

// --- AD1 Validations queue ---

export type ValidationKind = "driver" | "company" | "partner";

export const VALIDATION_KINDS: ValidationKind[] = [
  "driver",
  "company",
  "partner",
];

export type ValidationRejectReason =
  | "incomplete_documents"
  | "non_compliant_vehicle"
  | "fraud_suspicion"
  | "invalid_legal_info"
  | "other";

export const VALIDATION_REJECT_REASONS: ValidationRejectReason[] = [
  "incomplete_documents",
  "non_compliant_vehicle",
  "fraud_suspicion",
  "invalid_legal_info",
  "other",
];

export const VALIDATION_REJECT_REASON_LABELS: Record<
  ValidationRejectReason,
  string
> = {
  incomplete_documents: "Documents incomplets",
  non_compliant_vehicle: "Véhicule non conforme",
  fraud_suspicion: "Suspicion de fraude",
  invalid_legal_info: "Informations légales invalides",
  other: "Autre",
};

// Per-entity review meta. Last action wins (no append-only log).
export type ValidationReviewMeta = {
  reviewedBy?: string; // admin user id
  reviewedAt?: Date;
  rejection?: {
    reason: ValidationRejectReason;
    note?: string;
  };
  lastInfoRequest?: {
    message: string;
    requestedBy: string;
    requestedAt: Date;
  };
};

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
  // AD1 — per-entity admin review trail (last action only).
  validation?: ValidationReviewMeta;
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
  // AD1 — admin review trail.
  validation?: ValidationReviewMeta;
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
  // Deprecated: legacy euro-denominated cached fields. Computed live now from
  // RevenueDailyDoc + AdImpressionDailyDoc. Kept on type so existing seed +
  // mock callers compile.
  monthlySprayRevenue?: number;
  monthlyAdsRevenue?: number;
  // P5: admin-set monthly revenue target. Drives "% of objective" displays.
  monthlyTargetCents?: number;
  status: ValidationStatus;
  createdAt: Date;
  // AD1 — admin review trail.
  validation?: ValidationReviewMeta;
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
  // Cartridge bays. Fixed length CARTRIDGE_SLOT_COUNT. Slots may be empty
  // (scentId undefined) on freshly installed hardware.
  cartridges: CartridgeSlot[];
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

// --- Stock (P3) ---

export type ScentDoc = {
  _id?: ObjectId;
  sku: string; // unique short id like "BDC", "FDO"
  name: string; // "Bois de Cèdre"
  defaultCapacityMl: number; // typical cartridge size, default 500
  color?: string; // hex for UI accent (#8D6E63)
  createdAt: Date;
  updatedAt: Date;
};

// Slots per terminal — fixed at 5 cartridge bays per hardware spec.
export const CARTRIDGE_SLOT_COUNT = 5;

// Each slot may be unloaded (scentId undefined) on a brand-new terminal.
export type CartridgeSlot = {
  slot: number; // 1..CARTRIDGE_SLOT_COUNT
  scentId?: string; // FK to ScentDoc._id; undefined when slot is empty
  capacityMl: number; // capacity of physical cartridge currently inserted
  // levelPercent set if hardware reports it directly (Q2 hybrid). Else
  // computed from spraysSinceRefill at read time.
  levelPercent?: number;
  spraysSinceRefill: number;
  lastRefillAt?: Date;
};

export const STOCK_LOW_THRESHOLD_PCT = 50;
export const STOCK_CRITICAL_THRESHOLD_PCT = 25;

// Volume dispensed per spray. Used to decay level when hardware does not
// report levelPercent directly. Tunable per-deployment via seed-app-config
// later if needed.
export const ML_PER_SPRAY = 0.15;

export type StockStatus = "ok" | "low" | "critical";

export type StockOrderStatus = "pending" | "fulfilled" | "cancelled";

export type StockOrderLine = {
  scentId: string;
  qty: number; // number of cartridges ordered
};

export type StockOrderDoc = {
  _id?: ObjectId;
  partnerId: string;
  terminalId: string;
  lines: StockOrderLine[];
  status: StockOrderStatus;
  notes?: string;
  createdAt: Date;
  createdBy: string; // partner userId
  fulfilledAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
};

export type RefillLogDoc = {
  _id?: ObjectId;
  terminalId: string;
  slot: number;
  scentId: string;
  levelBefore: number;
  levelAfter: number;
  capacityMl: number;
  refilledBy: string; // admin userId
  refilledAt: Date;
  orderId?: string; // links back to fulfilled order, if any
  notes?: string;
};

// --- Ads (P4) ---

export type AdScheduleStatus =
  | "live"
  | "scheduled"
  | "paused"
  | "expired"
  | "cancelled";

export type AdScheduleDoc = {
  _id?: ObjectId;
  terminalId: string;
  campaignId: string;
  // Cached for fast filtering on partner + advertiser views.
  partnerId: string;
  companyId: string;
  // Time window: hours 0..23. End < start means overnight (e.g. 20→4).
  startHour: number;
  endHour: number;
  // Plays once every N seconds within the window. 60 = once a minute.
  intervalSeconds: number;
  status: AdScheduleStatus;
  pausedAt?: Date;
  pausedBy?: string;
  pauseReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

// Default schedule applied when admin assigns a borne terminal to a campaign.
export const AD_SCHEDULE_DEFAULT_START_HOUR = 18;
export const AD_SCHEDULE_DEFAULT_END_HOUR = 4;
export const AD_SCHEDULE_DEFAULT_INTERVAL_SECONDS = 60;
export const AD_SCHEDULE_INTERVAL_MIN = 10;
export const AD_SCHEDULE_INTERVAL_MAX = 3600;

export type AdImpressionDailyDoc = {
  _id?: ObjectId;
  terminalId: string;
  campaignId: string;
  date: string; // "YYYY-MM-DD" (UTC)
  impressions: number;
  updatedAt: Date;
};

export type AdIssueKind =
  | "not_playing"
  | "wrong_content"
  | "audio_issue"
  | "screen_issue"
  | "other";

export const AD_ISSUE_KINDS: AdIssueKind[] = [
  "not_playing",
  "wrong_content",
  "audio_issue",
  "screen_issue",
  "other",
];

export type AdIssueStatus = "open" | "resolved" | "dismissed";

export type AdIssueReportDoc = {
  _id?: ObjectId;
  partnerId: string;
  terminalId: string;
  scheduleId: string;
  campaignId: string;
  kind: AdIssueKind;
  description: string;
  status: AdIssueStatus;
  createdAt: Date;
  createdBy: string; // partner userId
  resolvedAt?: Date;
  resolvedBy?: string; // admin userId
  resolution?: string;
};

// --- Partner Revenue (P5) ---

// Per-spray + per-1000-impression rates. Stored in Collections.appConfig
// alongside the existing "payments" key. Fallback defaults below.
export type PartnerRevenueConfigDoc = {
  _id?: ObjectId;
  key: "partner_revenue";
  sprayRateCents: number; // earned per spray
  cpmCents: number; // earned per 1000 impressions
  updatedAt: Date;
};

export const PARTNER_REVENUE_DEFAULT_SPRAY_CENTS = 8;
export const PARTNER_REVENUE_DEFAULT_CPM_CENTS = 200;

// Daily counter row. Sprays are incremented by the heartbeat handler when a
// terminal reports a higher spraysToday than was previously stored. Ad
// impressions are NOT duplicated here — they live in AdImpressionDailyDoc and
// are joined at read time. Revenue cents are computed on read using current
// rates.
export type RevenueDailyDoc = {
  _id?: ObjectId;
  partnerId: string;
  terminalId: string;
  date: string; // "YYYY-MM-DD" UTC
  spraysCount: number;
  updatedAt: Date;
};

// Sealed monthly snapshot. Rates are frozen so re-issuing a statement yields
// the same numbers even after admin tunes config.
export type RevenueMonthlyTerminalLine = {
  terminalId: string;
  terminalCode?: string;
  terminalName?: string;
  spraysCount: number;
  impressions: number;
  sprayCents: number;
  adCents: number;
  totalCents: number;
};

export type RevenueMonthlyDoc = {
  _id?: ObjectId;
  partnerId: string;
  month: string; // "YYYY-MM"
  totalSprays: number;
  totalImpressions: number;
  sprayRateCents: number;
  cpmCents: number;
  sprayCents: number;
  adCents: number;
  totalCents: number;
  perTerminal: RevenueMonthlyTerminalLine[];
  sealedAt: Date;
};

// Auto-created at month seal. Admin marks paid in batch.
export type PartnerPayoutStatus = "scheduled" | "paid" | "failed";

export type PartnerPayoutDoc = {
  _id?: ObjectId;
  partnerId: string;
  month: string; // "YYYY-MM"
  totalCents: number;
  status: PartnerPayoutStatus;
  scheduledFor: Date; // when admin should process payment
  paidAt?: Date;
  paidBy?: string; // admin userId
  payoutReference?: string;
  failureReason?: string;
  createdAt: Date;
};

// Day of the month (1..28) when scheduled payouts should be processed.
export const PARTNER_PAYOUT_SCHEDULE_DAY = 5;

// --- AD2 Finances ---

export type InvoiceStatus = "brouillon" | "envoyee" | "payee" | "en_retard";

// `en_retard` is computed on read when status === "envoyee" and dueDate is past.
// Stored statuses are: brouillon | envoyee | payee.
export type InvoiceStoredStatus = "brouillon" | "envoyee" | "payee";

export type InvoiceLine = {
  label: string;
  qty: number;
  unitCents: number;
  totalCents: number;
};

export type InvoiceDoc = {
  _id?: ObjectId;
  ref: string; // Auto-assigned at create time, e.g. "F-2026-0412". Unique.
  companyId: string;
  campaignId?: string;
  issueDate: Date;
  dueDate: Date;
  lines: InvoiceLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: InvoiceStoredStatus;
  sentAt?: Date;
  sentTo?: string; // email
  paidAt?: Date;
  paidVia?: string;
  paidReference?: string;
  notes?: string;
  createdBy: string; // admin userId
  createdAt: Date;
  updatedAt: Date;
};

// Default payment terms when none provided.
export const INVOICE_DUE_DAYS_DEFAULT = 30;
// Default French VAT applied if caller does not pass an explicit taxCents.
export const INVOICE_VAT_RATE = 0.2;

export type ExpenseCategory =
  | "fourniture"
  | "sous_traitance"
  | "infrastructure"
  | "logistique";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "fourniture",
  "sous_traitance",
  "infrastructure",
  "logistique",
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fourniture: "Fourniture",
  sous_traitance: "Sous-traitance",
  infrastructure: "Infrastructure",
  logistique: "Logistique",
};

export type ExpenseDoc = {
  _id?: ObjectId;
  label: string;
  category: ExpenseCategory;
  amountCents: number; // positive
  vendor?: string;
  expenseDate: Date;
  notes?: string;
  createdBy: string; // admin userId
  createdAt: Date;
  updatedAt: Date;
};

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
  scents: "scents",
  stockOrders: "stock_orders",
  refillLogs: "refill_logs",
  adSchedules: "ad_schedules",
  adImpressionsDaily: "ad_impressions_daily",
  adIssueReports: "ad_issue_reports",
  revenueDaily: "revenue_daily",
  revenueMonthly: "revenue_monthly",
  partnerPayouts: "partner_payouts",
  invoices: "invoices",
  expenses: "expenses",
} as const;
