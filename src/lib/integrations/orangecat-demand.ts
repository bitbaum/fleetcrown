/**
 * Live open demand from OrangeCat's economy — the FIND → BUILD wire.
 *
 * OrangeCat is where needs are posted (public wishlists) and searched for; this
 * pulls that demand so FleetCrown's Loki can suggest building for real, current
 * need instead of guesses. Build it → publish to OrangeCat (existing seam) →
 * the two-sided matcher introduces it to whoever wished for it → settled. That
 * is the flywheel closing across the two products.
 *
 * Best-effort and cached: a slow/failed OrangeCat never blocks or breaks a Loki
 * turn — it just falls back to the last good feed, or to plain fleet context.
 */
import { ORANGECAT_BASE_FALLBACK } from "./orangecat";

const OC_BASE = process.env.ORANGECAT_API_BASE ?? ORANGECAT_BASE_FALLBACK;
const TTL_MS = 10 * 60 * 1000;

export interface DemandNeed {
  id: string;
  title: string;
  text: string;
  url: string;
}
export interface OpenDemand {
  needs: DemandNeed[];
  searches: { term: string; count: number }[];
}

let cache: { at: number; data: OpenDemand } | null = null;

/** Fetch the open-demand feed (cached ~10min). Returns null if unavailable and
 *  there's no cached copy — callers must treat demand as optional. */
export async function fetchOpenDemand(): Promise<OpenDemand | null> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  try {
    const res = await fetch(`${OC_BASE}/api/v1/demand?limit=15`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return cache?.data ?? null;
    }
    const json = await res.json();
    const data = (json?.data ?? json) as OpenDemand | undefined;
    if (!data || !Array.isArray(data.needs)) {
      return cache?.data ?? null;
    }
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return cache?.data ?? null;
  }
}

/** Format the demand feed as a compact Loki context block ("" if empty). */
export function buildDemandBlock(d: OpenDemand | null): string {
  if (!d) {
    return "";
  }
  const needLines = (d.needs ?? [])
    .slice(0, 8)
    .map((n) => `- [need] ${n.title}: ${n.text.replace(/\s+/g, " ").slice(0, 160)} (${n.url})`);
  const terms = (d.searches ?? [])
    .slice(0, 8)
    .map((s) => s.term)
    .filter(Boolean);
  if (needLines.length === 0 && terms.length === 0) {
    return "";
  }
  const parts = [
    "### Live demand on OrangeCat (open needs you could build for and list back — real demand, not guesses; if the operator asks what to build, ground your suggestions here)",
    ...needLines,
  ];
  if (terms.length > 0) {
    parts.push(`People are also searching for: ${terms.join(", ")}.`);
  }
  return parts.join("\n");
}
