import { db } from "./db";
import {
  Collections,
  type CampaignDoc,
  type CompanyDoc,
  type DriverDoc,
  type TerminalDoc,
} from "./schemas";
import type { SearchHitDTO } from "./search-serializer";

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_PER_TYPE_LIMIT = 5;

// Escapes regex metacharacters so user input can't blow up the engine or
// match unintended things. Anchored substring (no `^`) so partial words match.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(q: string): RegExp {
  return new RegExp(escapeRegex(q.trim()), "i");
}

async function searchCampaigns(re: RegExp): Promise<SearchHitDTO[]> {
  const docs = (await db
    .collection(Collections.campaigns)
    .find({
      $or: [
        { brand: { $regex: re } },
        { title: { $regex: re } },
        { domain: { $regex: re } },
        { city: { $regex: re } },
      ],
    })
    .project({ brand: 1, title: 1, city: 1, status: 1, campaignType: 1 })
    .limit(SEARCH_PER_TYPE_LIMIT)
    .toArray()) as Pick<
    CampaignDoc,
    "_id" | "brand" | "title" | "city" | "status" | "campaignType"
  >[];

  return docs.map((c) => ({
    type: "campaign" as const,
    id: c._id!.toString(),
    label: `${c.brand} — ${c.title}`,
    sublabel: `Campagne · ${c.campaignType ?? "flocage"} · ${c.city} · ${c.status}`,
    href: `/campagnes/${c._id!.toString()}`,
    icon: "megaphone" as const,
  }));
}

async function searchDrivers(re: RegExp): Promise<SearchHitDTO[]> {
  const docs = (await db
    .collection(Collections.drivers)
    .find({
      $or: [
        { firstName: { $regex: re } },
        { lastName: { $regex: re } },
        { phone: { $regex: re } },
        { city: { $regex: re } },
      ],
    })
    .project({ firstName: 1, lastName: 1, city: 1, status: 1 })
    .limit(SEARCH_PER_TYPE_LIMIT)
    .toArray()) as Pick<
    DriverDoc,
    "_id" | "firstName" | "lastName" | "city" | "status"
  >[];

  return docs.map((d) => ({
    type: "driver" as const,
    id: d._id!.toString(),
    label: `${d.firstName} ${d.lastName}`,
    sublabel: `Chauffeur · ${d.city} · ${d.status}`,
    href: `/chauffeurs/${d._id!.toString()}`,
    icon: "car" as const,
  }));
}

async function searchCompanies(re: RegExp): Promise<SearchHitDTO[]> {
  const docs = (await db
    .collection(Collections.companies)
    .find({
      $or: [
        { companyName: { $regex: re } },
        { contactName: { $regex: re } },
        { siret: { $regex: re } },
        { vatNumber: { $regex: re } },
        { city: { $regex: re } },
      ],
    })
    .project({ companyName: 1, contactName: 1, city: 1, status: 1 })
    .limit(SEARCH_PER_TYPE_LIMIT)
    .toArray()) as Pick<
    CompanyDoc,
    "_id" | "companyName" | "contactName" | "city" | "status"
  >[];

  return docs.map((c) => ({
    type: "company" as const,
    id: c._id!.toString(),
    label: c.companyName,
    sublabel: `Entreprise · ${c.city} · ${c.status}`,
    // No detail route yet — points at the list. Replace with /entreprises/<id>
    // once that route lands.
    href: "/entreprises",
    icon: "building-2" as const,
  }));
}

async function searchTerminals(re: RegExp): Promise<SearchHitDTO[]> {
  const docs = (await db
    .collection(Collections.terminals)
    .find({
      $or: [
        { code: { $regex: re } },
        { name: { $regex: re } },
        { address: { $regex: re } },
        { city: { $regex: re } },
      ],
    })
    .project({
      code: 1,
      name: 1,
      city: 1,
      lastKnownStatus: 1,
    })
    .limit(SEARCH_PER_TYPE_LIMIT)
    .toArray()) as Pick<
    TerminalDoc,
    "_id" | "code" | "name" | "city" | "lastKnownStatus"
  >[];

  return docs.map((t) => ({
    type: "terminal" as const,
    id: t._id!.toString(),
    label: `${t.code} — ${t.name}`,
    sublabel: `Borne · ${t.city} · ${t.lastKnownStatus}`,
    // No detail route yet; same fallback as companies.
    href: "/bornes",
    icon: "spray-can" as const,
  }));
}

export async function searchAll(q: string): Promise<SearchHitDTO[]> {
  const trimmed = q.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return [];
  const re = buildRegex(trimmed);

  const [campaigns, drivers, companies, terminals] = await Promise.all([
    searchCampaigns(re),
    searchDrivers(re),
    searchCompanies(re),
    searchTerminals(re),
  ]);

  // Order matters for UX: campaigns first (highest user value), then people,
  // then companies, then hardware. Items within a type keep mongo's natural
  // order (insertion). Bumping to relevance ranking is a future step.
  return [...campaigns, ...drivers, ...companies, ...terminals];
}
