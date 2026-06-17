// SSOT for matching a FleetCrown project key to the name a user actually gave
// their Zellij tab. Project keys are slugs ("revampit", "aoz-housing"); the
// live tab might be "revamp-it", "Revamp It", "AOZ Housing", etc. Matching used
// to be exact-case-insensitive in three places (terminals/zellij.ts,
// agent-runtime.ts, desktop poller), so "revampit" ≠ "revamp-it" → focus/inject
// silently failed. Normalize away case + punctuation and they collapse.

/** Lowercase + strip everything that isn't a letter or digit. So "revamp-it",
 *  "Revamp It", "revamp_it" and "revampit" all become "revampit". */
export function normalizeTabKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The live tab name (original casing/punctuation preserved) that matches
 *  `target`, or null if none. Exact case-insensitive wins first (most precise),
 *  then normalized equality. A null result means "no such tab" — the caller
 *  then creates it under the canonical name rather than mis-targeting. */
export function findMatchingTab(target: string, candidates: string[]): string | null {
  const lower = target.toLowerCase();
  const exact = candidates.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const norm = normalizeTabKey(target);
  if (!norm) return null;
  return candidates.find((c) => normalizeTabKey(c) === norm) ?? null;
}
