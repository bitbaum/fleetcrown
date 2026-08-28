/**
 * Pure matching logic for fleet-refs-audit.mjs, split out so it can be unit
 * tested without a GitHub token or a network call.
 */

/**
 * Lines that are retired-handle names to be flagged, from workflow file text.
 *
 * Comment lines are stripped first: a workflow that EXPLAINS an outage names
 * the retired account on purpose, and a gate that fires on its own
 * documentation is a gate people learn to ignore. What matters is a live
 * reference — a `uses:`, or a clone/gh call inside a `run:` block.
 *
 * The RETIRED_HANDLES declaration itself is stripped next, for the identical
 * reason one level up: this audit's OWN workflow configures its search list
 * with `env: { RETIRED_HANDLES: maonakamoto }`, and that line is not a
 * reference to be corrected — it is the definition of what counts as one.
 * Found in production 2026-08-28: fleet-refs-audit.yml flagged itself on its
 * first real run, which is the exact "gate fires on itself" failure the
 * comment-stripping above already exists to prevent, just one layer deeper.
 */
export function retiredHandleMatches(text, retiredHandles) {
  const withoutComments = text.split('\n').filter(l => !/^\s*#/.test(l));
  const live = withoutComments
    .filter(l => !/^\s*RETIRED_HANDLES\s*:/.test(l))
    .join('\n');
  return retiredHandles.filter(h => live.includes(h));
}

/** `uses: owner/repo/path@ref` and `uses: owner/repo@ref`. Local (`./…`) and
 *  container (`docker://`) references have no owner to be wrong about.
 *
 *  LIMITATION, stated rather than assumed: this matches by line shape, not by
 *  YAML structural position. A `run: |` block whose FIRST physical line
 *  (after indentation) happens to read literally `uses: owner/repo@ref` —
 *  e.g. example text in an echoed usage message — would be treated as a real
 *  `uses:` key. Narrow and not observed in this fleet; a real YAML parse
 *  would close it at the cost of a dependency this script deliberately has
 *  none of. */
export const USES = /^\s*uses:\s*([A-Za-z0-9][\w.-]*)\/([\w.-]+)(?:\/[^@\s]+)?@/gm;

/**
 * This is the actual mechanism that catches the outage: REST resolves a
 * rename/transfer redirect and returns the canonical `full_name`; Actions'
 * `uses:` resolver does not resolve it at all. `real` is what `resolve()` in
 * fleet-refs-audit.mjs already returned for `slug` — this function makes no
 * network call, so it is fully testable without a token.
 *
 *   real === undefined  → the lookup itself failed (rate limit, 5xx, etc.) —
 *                          report as unreadable, never as clean and never as
 *                          stale. Silence here would be worse than either.
 *   real === null       → the repo does not exist under this name at all
 *   real !== slug        → it exists, but Actions will resolve a DIFFERENT
 *                          name than what's written — the exact redirect gap
 *   real === slug         → the reference is already canonical
 */
export function verdictFor(slug, real) {
  if (real === undefined) return { kind: 'unreadable', message: `${slug} (lookup failed)` };
  if (real === null) return { kind: 'stale', message: `uses ${slug} — DOES NOT EXIST` };
  if (real !== slug) return { kind: 'stale', message: `uses ${slug} — canonical is ${real} (Actions will NOT follow this)` };
  return { kind: 'ok' };
}
