// Which projects have a Solon organisation.
//
// Solon is its own product with its own database; FleetCrown must not read it
// directly. Solon publishes `GET /api/orgs/<slug>` (public — membership is
// public record there), so the register asks it per slug and remembers the
// answer for a while. A probe that fails is reported as UNCHECKED, never as
// "no organisation": the two must look different to a consumer.

const SOLON_BASE = process.env.SOLON_BASE_URL ?? "https://solon.orangecat.ch";
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 2500;

type Cache = { at: number; orgs: Set<string>; checked: boolean };
let cache: Cache | null = null;

/**
 * The set of organisation slugs Solon knows, for the slugs we care about.
 * Solon has no public list endpoint, so this probes the candidates given (or
 * the last-known set) rather than enumerating.
 */
export async function solonOrgSlugs(
  candidates?: Iterable<string>,
  now = Date.now(),
): Promise<{ orgs: Set<string>; checked: boolean }> {
  if (cache && now - cache.at < TTL_MS) return { orgs: cache.orgs, checked: cache.checked };
  const slugs = new Set<string>(candidates ?? cache?.orgs ?? ["orangecat"]);
  const orgs = new Set<string>();
  let checked = true;
  await Promise.all(
    [...slugs].map(async (slug) => {
      try {
        const res = await fetch(`${SOLON_BASE}/api/orgs/${encodeURIComponent(slug)}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { accept: "application/json" },
        });
        if (res.ok) orgs.add(slug);
        else if (res.status !== 404) checked = false;
      } catch {
        checked = false;
      }
    }),
  );
  cache = { at: now, orgs, checked };
  return { orgs, checked };
}
