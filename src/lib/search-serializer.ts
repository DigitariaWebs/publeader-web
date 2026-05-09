import type { IconName } from "@/components/Icon";

export type SearchHitType = "campaign" | "driver" | "company" | "terminal";

export type SearchHitDTO = {
  type: SearchHitType;
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: IconName;
};

export type SearchResponseDTO = {
  query: string;
  hits: SearchHitDTO[];
  byType: Record<SearchHitType, number>;
};
