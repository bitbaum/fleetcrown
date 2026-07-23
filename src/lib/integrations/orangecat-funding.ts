import type { OrangeCatEntityLink } from "@/db/schema";
import { OC_BASE } from "./orangecat";

export interface OrangeCatFundingSummary {
  totalBtc: number;
  contributorCount: number;
  namedSupporterCount: number;
}

export async function fetchOrangeCatFundingSummary(
  link: OrangeCatEntityLink | undefined,
): Promise<OrangeCatFundingSummary | null> {
  if (!link) return null;
  try {
    const response = await fetch(
      `${OC_BASE}/api/v1/entities/${encodeURIComponent(link.entityType)}/${link.entityId}/funding`,
      { cache: "no-store", signal: AbortSignal.timeout(4_000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: OrangeCatFundingSummary | null };
    return body.data ?? null;
  } catch {
    return null;
  }
}
