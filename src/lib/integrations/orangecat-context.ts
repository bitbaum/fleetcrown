// OrangeCat context fetcher for the dispatch strategist.
//
// Pulls a brief snapshot of the actor's commercial state on OrangeCat —
// what they sell, what they offer, what's active — so the Groq-composed
// dispatch prompts can surface "this work has revenue context" instead of
// running blind. This is the read half of the FC↔OC loop; the write half
// (subscription mirror) lives in ./orangecat.ts.
//
// Design constraints:
//   - **Strictly non-fatal**: if OC is unreachable or no key is set, the
//     strategist proceeds as before. Never throws into the dispatch path.
//   - **Bounded latency**: a 1.5s timeout caps the worst case. The strategist
//     itself targets <2s end-to-end on Groq's free tier; we can't add seconds.
//   - **Cached**: 5-minute in-memory TTL. OC state changes slowly (a new
//     service is created hours apart at best); refetching per-dispatch
//     burns the free tier of OC's API for no benefit.
//   - **Bounded payload**: list() is paginated; we cap at 20 each. The
//     strategist gets a summary, not a dump.

import { getOrangeCatClient } from "./orangecat";

export type OrangeCatContext = {
  /** What the actor sells (priced offerings). */
  services: { count: number; titles: string[] };
  /** Physical / digital goods listed. */
  products: { count: number; titles: string[] };
  /** Whether the snapshot is live or a cached fallback after a fetch failure. */
  stale: boolean;
  /** ISO timestamp of when the snapshot was assembled. */
  fetchedAt: string;
};

const CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 1_500;
const LIST_PAGE_SIZE = 20;
const TITLE_SAMPLE_LIMIT = 6;

type Cached = { snapshot: OrangeCatContext; expiresAt: number };
let cache: Cached | null = null;

/**
 * Returns a summary of the OC actor's commercial state, or null if the
 * integration isn't configured. Never throws.
 */
export async function getOrangeCatContext(): Promise<OrangeCatContext | null> {
  const client = getOrangeCatClient();
  if (!client) return null;

  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.snapshot;
  }

  // Race the fetch against a hard timeout — if OC takes >1.5s, fall back to
  // the cached snapshot if we have one, otherwise null. We do NOT want to
  // slow the strategist for OC's latency budget.
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), FETCH_TIMEOUT_MS),
  );

  try {
    const fetched = await Promise.race([
      fetchSnapshot(client),
      timeoutPromise,
    ]);
    if (fetched) {
      cache = { snapshot: fetched, expiresAt: now + CACHE_TTL_MS };
      return fetched;
    }
    // Timed out or fetch returned null — degrade to stale cache if present.
    if (cache) {
      return { ...cache.snapshot, stale: true };
    }
    return null;
  } catch (err) {
    console.warn("[orangecat-context] fetch failed:", (err as Error).message);
    if (cache) {
      return { ...cache.snapshot, stale: true };
    }
    return null;
  }
}

/**
 * Compact textual rendering for the strategist prompt. Returns empty
 * string when there's nothing to say — the caller can concatenate
 * unconditionally.
 */
export function renderOrangeCatContext(ctx: OrangeCatContext | null): string {
  if (!ctx) return "";
  const lines: string[] = [];
  const stale = ctx.stale ? " (stale)" : "";
  if (ctx.services.count > 0) {
    const sample = ctx.services.titles.slice(0, TITLE_SAMPLE_LIMIT).join(", ");
    const overflow = ctx.services.count > TITLE_SAMPLE_LIMIT ? ` +${ctx.services.count - TITLE_SAMPLE_LIMIT} more` : "";
    lines.push(`Services live on OrangeCat${stale}: ${ctx.services.count} (${sample}${overflow})`);
  }
  if (ctx.products.count > 0) {
    const sample = ctx.products.titles.slice(0, TITLE_SAMPLE_LIMIT).join(", ");
    const overflow = ctx.products.count > TITLE_SAMPLE_LIMIT ? ` +${ctx.products.count - TITLE_SAMPLE_LIMIT} more` : "";
    lines.push(`Products listed on OrangeCat${stale}: ${ctx.products.count} (${sample}${overflow})`);
  }
  if (lines.length === 0) return "";
  return `\nCommercial context:\n  • ${lines.join("\n  • ")}\n`;
}

// Internal: assemble the snapshot. Returns null on any failure so the
// caller can fall back to cache.
async function fetchSnapshot(
  client: NonNullable<ReturnType<typeof getOrangeCatClient>>,
): Promise<OrangeCatContext | null> {
  try {
    const [services, products] = await Promise.all([
      client.services.list({ limit: LIST_PAGE_SIZE }),
      client.products.list({ limit: LIST_PAGE_SIZE }),
    ]);
    return {
      services: {
        count: services.length,
        titles: services.map(extractTitle).filter(Boolean),
      },
      products: {
        count: products.length,
        titles: products.map(extractTitle).filter(Boolean),
      },
      stale: false,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// The SDK response shapes are typed but loose at the field level (each
// entity has its own response interface). Title is the user-readable
// identifier for every entity that ships today; extracting it defensively
// here keeps the strategist resilient to schema drift.
function extractTitle(entity: unknown): string {
  if (entity && typeof entity === "object" && "title" in entity) {
    const t = (entity as { title: unknown }).title;
    if (typeof t === "string" && t.trim().length > 0) return t.trim();
  }
  return "";
}

/** Test helper — drop the in-memory cache so a follow-up fetch hits OC. */
export function _resetOrangeCatContextCache(): void {
  cache = null;
}
