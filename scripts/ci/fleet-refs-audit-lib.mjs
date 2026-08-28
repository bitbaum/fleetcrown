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
 *  container (`docker://`) references have no owner to be wrong about. */
export const USES = /^\s*uses:\s*([A-Za-z0-9][\w.-]*)\/([\w.-]+)(?:\/[^@\s]+)?@/gm;
