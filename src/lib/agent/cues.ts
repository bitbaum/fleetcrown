/**
 * Turn cues — pure predicates deciding which optional context a turn earns.
 *
 * Kept apart from context.ts (which imports the whole data layer) so the policy
 * can be tested without a database. The rule they share: the seed sits near the
 * small models' prompt ceiling, so optional context has to be asked for, and
 * every cue is matched loosely because the two errors are not symmetric — a
 * false positive costs a few tokens, a false negative costs a confident wrong
 * answer about the operator's own records.
 */

/** Planning/triage turns, which is when the computed daily brief earns its tokens. */
export const PLANNING_CUES =
  /\b(plan|today|day|urgent|priorit|attention|focus|stuck|due|deadline|overdue|next|habit|commit|risk|blocked|first)\b/i;

/**
 * Turns about the approval queue.
 *
 * This one is load-bearing beyond token budgeting. When Groq's org-wide TPM
 * window is exhausted the tool loop dies entirely and Loki answers from seed
 * facts on a TOOLLESS fallback model — so if this cue misses, a queue reachable
 * only by tool call is invisible and the operator is told nothing is pending
 * while drafts wait. Production served exactly that (2026-08-14). Hence several
 * independent words rather than one canonical term: the question survives any
 * single one of them being missing or misspelled.
 */
export const APPROVAL_CUES =
  /\b(approv|pending|queue|waiting|await|sign[- ]?off|authoriz|authoris|decide|decision|draft|reject)\w*/i;
