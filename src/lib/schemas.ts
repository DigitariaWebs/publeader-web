import { ObjectId } from "mongodb";

export type ValidationStatus = "pending" | "validated" | "rejected";
export type UserRoleName =
  | "admin"
  | "advertiser"
  | "driver"
  | "partner"
  | "team_member";

export type DriverDoc = {
  _id?: ObjectId;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  vehicleModel: string;
  vehicleYear: string;
  licensePlate: string;
  vehicleType: string;
  status: ValidationStatus;
  joinedAt: Date;
  campaignsDone: number;
  rating: number;
  totalKm: number;
  totalEarnings: number;
  documentsUploaded: boolean;
};

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
  brandColor?: string;
  logoUrl?: string;
  createdAt: Date;
};

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

export const Collections = {
  drivers: "drivers",
  companies: "companies",
  partners: "partners",
} as const;
