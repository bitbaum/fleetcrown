/**
 * Live open demand from OrangeCat's economy — the FIND → BUILD wire.
 *
 * OrangeCat is where needs are posted (public wishlists) and searched for; this
 * pulls that demand so Loki can suggest building for real, current
 * need instead of guesses. Build it → publish to OrangeCat (existing seam) →
 * the two-sided matcher introduces it to whoever wished for it → settled. That
 * is the flywheel closing across the two products.
 *
 * Best-effort and cached: a slow/failed OrangeCat never blocks or breaks a Loki
 * turn — it just falls back to the last good feed, or to plain fleet context.
 */
import { OC_BASE } from "./orangecat";

const TTL_MS = 10 * 60 * 1000;
/** Below this length a query is too vague to search the economy usefully. */
const MIN_QUERY_LEN = 8;

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

/** GET an OrangeCat v1 endpoint, unwrapping the { data } envelope. Returns null
 *  on any failure (non-2xx, timeout, parse) — every FC→OC read is best-effort. */
async function ocGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${OC_BASE}${path}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return (json?.data ?? json) as T;
  } catch {
    return null;
  }
}

/** Fetch the open-demand feed (cached ~10min). Returns null if unavailable and
 *  there's no cached copy — callers must treat demand as optional. */
export async function fetchOpenDemand(): Promise<OpenDemand | null> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  const data = await ocGet<OpenDemand>("/api/v1/demand?limit=15");
  if (!data || !Array.isArray(data.needs)) {
    return cache?.data ?? null;
  }
  cache = { at: Date.now(), data };
  return data;
}

export interface EconomyMatch {
  type: string;
  title: string;
  description: string;
  url: string;
  similarity?: number;
}

/**
 * Query-scoped semantic search over OrangeCat's economy. OrangeCat embeds the
 * text with its own model server-side (GET /api/v1/search), so Loki never
 * needs a shared vector space — it just sends the operator's words and gets
 * meaning-ranked matches back. Best-effort; "[]" on any failure.
 */
export async function searchEconomy(query: string): Promise<EconomyMatch[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) {
    return [];
  }
  const data = await ocGet<{ results?: EconomyMatch[] }>(
    `/api/v1/search?q=${encodeURIComponent(q.slice(0, 200))}`,
  );
  return Array.isArray(data?.results) ? data.results : [];
}
