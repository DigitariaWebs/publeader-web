import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { searchAll, SEARCH_MIN_LENGTH } from "@/lib/search-service";
import type {
  SearchHitDTO,
  SearchHitType,
  SearchResponseDTO,
} from "@/lib/search-serializer";

export const dynamic = "force-dynamic";

const TYPES: SearchHitType[] = ["campaign", "driver", "company", "terminal"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers);
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  if (q.trim().length < SEARCH_MIN_LENGTH) {
    const empty: SearchResponseDTO = {
      query: q,
      hits: [],
      byType: { campaign: 0, driver: 0, company: 0, terminal: 0 },
    };
    return NextResponse.json(empty);
  }

  const hits: SearchHitDTO[] = await searchAll(q);
  const byType: Record<SearchHitType, number> = {
    campaign: 0,
    driver: 0,
    company: 0,
    terminal: 0,
  };
  for (const h of hits) {
    if (TYPES.includes(h.type)) byType[h.type]++;
  }
  const response: SearchResponseDTO = { query: q, hits, byType };
  return NextResponse.json(response);
}
