// Display helpers for project metadata shown on PUBLIC surfaces (hero, profile).
//
// The bulk GitHub-import flow stamped every project with a placeholder
// description ("Local repository imported from fleetcrown-ui"). It's dead text,
// not signal — never show it. Until real descriptions are backfilled, treat the
// stub as empty so public surfaces stay clean instead of repeating it N times.

const PLACEHOLDER_DESCRIPTIONS = new Set([
  "local repository imported from fleetcrown-ui",
  "local repository imported from fleetcrown",
  "local repository",
  "imported from fleetcrown-ui",
]);

/** Real description, or null when it's empty / the import placeholder. */
export function cleanDescription(desc: string | null | undefined): string | null {
  const d = desc?.trim();
  if (!d) return null;
  return PLACEHOLDER_DESCRIPTIONS.has(d.toLowerCase()) ? null : d;
}

/**
 * Non-answers a profile field can hold — the same "dead text, not signal"
 * problem as PLACEHOLDER_DESCRIPTIONS, one layer down.
 *
 * A model asked to fill 17 named fields from a two-line description writes
 * "Unknown" for the ones it cannot infer rather than omitting them (the
 * extraction prompt only says "omit if unknown" on 3 of them). HamsterCheek is
 * the live case: `stack: "Unknown"`, `competitors: "Unknown"`. Those are
 * truthy, so every "is this filled?" check counted them — health scored a point
 * for a field that says nothing, the context header claimed a field complete,
 * and the kickoff planner skipped the profile step for a project whose profile
 * was not actually filled in.
 */
const PLACEHOLDER_ANSWERS = new Set([
  "unknown", "n/a", "na", "none", "nil", "null", "tbd", "to be determined",
  "not specified", "not applicable", "not known", "unspecified", "-", "—", "?",
]);

/**
 * Does this attribute hold a real answer? Use everywhere a field's presence
 * decides something — a placeholder must never earn a health point, satisfy a
 * gate, or brief an agent with "STACK: Unknown".
 */
export function hasAnswer(value: string | null | undefined): boolean {
  const v = value?.trim();
  if (!v) return false;
  return !PLACEHOLDER_ANSWERS.has(v.toLowerCase().replace(/[.!]+$/, ""));
}

/**
 * A short lead for a dossier/card header — the first sentence(s) up to ~maxChars.
 * Descriptions are frequently the entire CLAUDE.md dumped in (400+ words); the
 * header wants a summary, not an essay. Prefers whole-sentence boundaries and
 * appends an ellipsis when it trims.
 */
export function summarizeDescription(desc: string | null | undefined, maxChars = 220): string | null {
  const clean = cleanDescription(desc);
  if (!clean || clean.length <= maxChars) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let out = sentences[0] ?? "";
  for (let i = 1; i < sentences.length; i++) {
    if (out.length + 1 + sentences[i].length > maxChars) break;
    out += " " + sentences[i];
  }
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, "");
  return `${out.trimEnd()}…`;
}

/** A handoff/run older than this reads as stale: the dossier's "Status quo" must
 *  not present a week-old snapshot as the live, healthy present. */
export const DOSSIER_STALE_MS = 6 * 60 * 60 * 1000;

// Names our own smoke/dogfood suites mint — e.g. `smoke-1783188931860-gh`,
// `smoke-<ts> person`. A leaked test row once surfaced on the public landing
// hero (2026-07-08 dogfood find); defend the public face so a future leak
// can never repeat it, independent of DB hygiene.
const TEST_ARTIFACT_NAME = /^smoke-\d{6,}/i;

/** True when a project name is an obvious test/dogfood artifact — never show it publicly. */
export function isPublicTestArtifact(name: string | null | undefined): boolean {
  return TEST_ARTIFACT_NAME.test((name ?? "").trim());
}
