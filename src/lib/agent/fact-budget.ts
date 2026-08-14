import type { Fact } from "@/lib/agent/core/facts";

/**
 * Fact-budget policy for the tool loop — pure, and load-bearing.
 *
 * The facts array is ordered [seed context ... tool results]: the seed's HEAD
 * is its most relevant slice, and everything a tool fetched THIS conversation
 * sits at the TAIL. Tool results are the facts the model explicitly asked for
 * — i.e. the answer — so any policy that sheds the tail silently deletes the
 * answer while keeping the wallpaper. That happened in production twice from
 * two different code paths (the MAX_FACTS merge cap and the 413 prompt trim,
 * both head-keeping slices): list_pending_approvals ran, its facts were shed,
 * and the model truthfully answered "Not in your data."
 */

/** Trim to n facts keeping BOTH ends — relevant seed head, fresh tool tail. */
export function trimFactsToBudget(all: Fact[], n: number): Fact[] {
  if (all.length <= n) return all;
  // A budget of zero must mean zero. `slice(-0)` is `slice(0)`, so the general
  // path below would hand back the ENTIRE array for n = 0 — the exact opposite
  // of what the caller asked for, and silent.
  if (n <= 0) return [];
  return [...all.slice(0, Math.ceil(n / 2)), ...all.slice(-Math.floor(n / 2))];
}

/** Merge tool results under the cap: fresh facts survive whole, older context
 *  fills whatever room remains (from the front, where the seed's best lives). */
export function mergeFactsWithCap(existing: Fact[], fresh: Fact[], cap: number): Fact[] {
  const kept = fresh.slice(0, cap);
  const room = Math.max(0, cap - kept.length);
  return [...existing.slice(0, room), ...kept];
}

/**
 * Rough token count. Deliberately crude — ~4 characters per token is close
 * enough for English prose, and the alternative (shipping a tokenizer for the
 * provider of the week) buys precision this decision does not need: the budget
 * it feeds already carries a safety margin.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The largest slice of `all` whose rendered context still fits one call.
 *
 * Sizing the prompt BEFORE sending it is the difference between a tool loop
 * that runs and one that cannot. Groq's ceiling is tokens per MINUTE for the
 * whole request — 12000 on the 70B, 6000 on the 8B step-down — and a loop makes
 * several calls inside that same minute. Discovering the limit by being refused
 * costs the round trip AND leaves the following rounds just as oversized, so a
 * turn that starts too large never recovers, however many times it retries.
 *
 * `overheadChars` is everything charged besides facts: system prompt, tool
 * schemas, the question, and the conversation so far — all of which GROW as the
 * loop proceeds, which is why the fit is recomputed every round rather than
 * once.
 *
 * Returns [] when the overhead alone busts the budget: no amount of shedding
 * helps there, and pretending otherwise would just hide the real problem.
 */
export function fitFactsToBudget(
  all: Fact[],
  render: (facts: Fact[]) => string,
  overheadChars: number,
  budgetTokens: number,
): Fact[] {
  const overhead = Math.ceil(overheadChars / 4);
  const fits = (n: number) => overhead + estimateTokens(render(trimFactsToBudget(all, n))) <= budgetTokens;

  if (fits(all.length)) return all;
  // Binary search the fact count. Rendered size grows with n, so the predicate
  // is monotonic and the largest fitting n is well defined.
  let lo = 0;
  let hi = all.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return trimFactsToBudget(all, lo);
}
