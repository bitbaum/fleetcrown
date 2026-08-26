/**
 * Resolve "which zellij tab is project X in?" WITHOUT relying on the tab's
 * name.
 *
 * FleetCrown has always answered that question by string-matching the project
 * key against tab names, which was true while every tab was renamed after its
 * project. That convention is retired: a live session's tab now reads
 * "Tab #9", and one pane hosts several concurrent sessions. So every
 * name-keyed operation — focus, inject, peek, dump — fails with "tab not
 * found: <project>" for a tab that is sitting right there, and the Retry
 * button on that banner can never succeed, because nothing about retrying
 * makes a name appear.
 *
 * The empirical answer is already on the machine. Every agent process inherits
 * ZELLIJ_PANE_ID from its pane, and /proc gives us its cwd. So: find a running
 * agent whose working directory is inside the project, take its pane id, and
 * join that against zellij's own pane -> tab map. The tab's name is then an
 * output, not an input — "Tab #9" targets exactly as well as "orangecat".
 *
 * Pure by construction: the caller supplies the process list and the pane map
 * lookup, so the matching rules are unit-testable without /proc or zellij.
 */

import { normalizeTabKey } from "@/lib/tab-match";

/** The subset of an agent process this resolver needs. */
export type PaneCandidate = {
  cwd: string;
  pid: number;
  zellijPaneId?: number;
  zellijSession?: string;
};

/**
 * Does `cwd` sit inside the project called `projectKey`?
 *
 * Segment-wise rather than prefix-wise, because the checkout root is not the
 * only place agents run: worktrees live at
 * `<repo>/.claude/worktrees/<branch>`, and a prefix test against a directory
 * we do not know would miss them. Segments are compared through
 * `normalizeTabKey`, the same normalizer tab-name matching uses, so
 * "aoz-housing", "AOZ Housing" and "aozhousing" all collapse to one key —
 * one definition of "same project", not two that drift.
 */
export function cwdBelongsToProject(cwd: string, projectKey: string): boolean {
  const key = normalizeTabKey(projectKey);
  if (!key) return false;
  return cwd.split("/").some((segment) => normalizeTabKey(segment) === key);
}

/**
 * The pane most likely to BE the project's session.
 *
 * Several sessions in one repo is normal here (commonly 5-10 across the
 * fleet, several in the same checkout), so ties must break deterministically
 * or focus would land somewhere different each click. Shortest cwd wins — the
 * repo root outranks a worktree nested under it — then lowest pid. Focusing
 * one of the project's tabs is the right outcome; the wrong outcome would be
 * a different tab on every attempt.
 */
export function findPaneForProject(
  projectKey: string,
  processes: readonly PaneCandidate[],
): PaneCandidate | null {
  const matches = processes
    .filter((p) => p.zellijPaneId !== undefined && p.zellijSession)
    .filter((p) => cwdBelongsToProject(p.cwd, projectKey))
    .sort((a, b) => a.cwd.length - b.cwd.length || a.pid - b.pid);
  return matches[0] ?? null;
}

/**
 * Project key -> the session and live tab name it is actually running in, or
 * null when no agent for that project is running anywhere. Null is the honest
 * answer: it means the tab genuinely is not open, which is a different user
 * problem than "open but misnamed" and deserves a different message.
 */
export function resolveTabByRunningAgent(
  projectKey: string,
  processes: readonly PaneCandidate[],
  paneTabMap: (session: string) => Map<number, string>,
): { session: string; tab: string } | null {
  const pane = findPaneForProject(projectKey, processes);
  if (!pane) return null;
  const tab = paneTabMap(pane.zellijSession!).get(pane.zellijPaneId!);
  return tab ? { session: pane.zellijSession!, tab } : null;
}
