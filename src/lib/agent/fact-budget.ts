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
  return [...all.slice(0, Math.ceil(n / 2)), ...all.slice(-Math.floor(n / 2))];
}

/** Merge tool results under the cap: fresh facts survive whole, older context
 *  fills whatever room remains (from the front, where the seed's best lives). */
export function mergeFactsWithCap(existing: Fact[], fresh: Fact[], cap: number): Fact[] {
  const kept = fresh.slice(0, cap);
  const room = Math.max(0, cap - kept.length);
  return [...existing.slice(0, room), ...kept];
}
