/**
 * Operator context for dispatch — the life-OS half of the fleet↔life-OS bridge.
 *
 * getProjectContext already injects a project's OWN brief + goals into every
 * dispatch. What was missing is the operator's *cross-project* state: the
 * captain's top-level goals and near-term commitments/deadlines. Injecting these
 * is what makes the fleet work toward the operator's actual objectives — "the
 * life-OS run by your fleet" — instead of treating each project in a vacuum.
 *
 * Deliberately NARROW: only goals + deadlines, the two life-OS facts that change
 * how an agent prioritizes. Habits, people, and money are intentionally excluded
 * — they'd be noise for a coding agent, and dispatch prompts can run on external
 * runtimes, so we inject the least personal data that still helps.
 *
 * Best-effort: returns "" when there's nothing (so callers can omit the section).
 * The pure layout lives in dispatch-operator-context-format.ts (DB-free, tested).
 */
import { listTopLevelActiveGoals } from "@/db/queries/goals";
import { listUpcomingCommitments } from "@/db/queries/today";
import {
  OPERATOR_CONTEXT_HEADING,
  formatOperatorContextBlock,
} from "@/lib/dispatch-operator-context-format";

/** Raw operator block (no heading) for `userId`, or "" when there's nothing. */
export async function buildOperatorContextBlock(userId: string): Promise<string> {
  const [goals, commitments] = await Promise.all([
    listTopLevelActiveGoals(userId).catch(() => []),
    listUpcomingCommitments(userId).catch(() => []),
  ]);
  return formatOperatorContextBlock(goals, commitments);
}

/** Full labelled section (heading + block) ready to drop into a dispatch prompt,
 *  or "" when the operator has no top-level goals or near-term deadlines. Every
 *  dispatch path (local inject, cloud assemble, orchestration/run) uses this so
 *  the framing stays identical. */
export async function buildOperatorContextSection(userId: string): Promise<string> {
  const block = await buildOperatorContextBlock(userId).catch(() => "");
  return block ? `${OPERATOR_CONTEXT_HEADING}\n${block}` : "";
}
