import { sql } from "drizzle-orm";
import { promptHistory } from "@/db/schema/prompt-history";

/**
 * Synthetic smoke-probe traffic must never render as real fleet activity.
 *
 * The pre-push prod dogfood (scripts/test/authenticated-smoke.ts) injects
 * `[smoke-<ts>] probe — ignore` prompts against a REAL project to exercise
 * the dispatch pipeline end-to-end. Those rows land in prompt_history like
 * any dispatch and — before this filter — fanned out into every activity
 * surface: workspace tab rows, the card activity ledger, Recent activity,
 * and Paste from history ("bitbaum · [smoke-1786649849209] probe — ignore"
 * rendered as the fleet's work, 2026-08-13).
 *
 * The probe SHOULD keep flowing through the pipeline (that's what it tests);
 * it must only be excluded from surfaces that present dispatches as user
 * activity. One marker, one filter — the prefix below is the contract with
 * the smoke script. Change one, change both.
 */
export const SMOKE_MARKER_PREFIX = "[smoke-";

/** WHERE fragment for prompt_history reads: drop smoke-probe rows. */
export function excludeSmokeDispatchesSql() {
  // '[' is not a LIKE metacharacter in Postgres — no escaping needed.
  return sql`(${promptHistory.customPrompt} IS NULL OR ${promptHistory.customPrompt} NOT LIKE ${SMOKE_MARKER_PREFIX + "%"})`;
}
