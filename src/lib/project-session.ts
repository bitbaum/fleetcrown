import type { SessionState } from "@/lib/control-types";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";
import { RUNNER_OFFLINE_THRESHOLD_MS } from "@/lib/constants/runner";

/**
 * Is a persisted runtime observation still trustworthy? Runtime fields
 * (agentRunning, activeAgents, currentPrompt, tabOpen) are CLAIMS made by a
 * runner at push time — when the runner stops reporting a project (agent
 * killed, machine asleep, project dropped from its payload), the row freezes
 * at its last observation and would otherwise show "Working" forever
 * (2026-07-14: a killed agent read as "Live agent process detected · 23m").
 * Past the runner-offline threshold, treat those claims as expired. Session
 * HANDOFFS are deliberately exempt — a handoff is a historical fact, not a
 * liveness claim, and it must survive so runs can still close from it.
 */
export function isRuntimeObservationFresh(
  r: Pick<DbProjectState, "runtimeObservedAt"> | null | undefined,
  nowMs = Date.now(),
): boolean {
  const t = r?.runtimeObservedAt?.getTime();
  return t != null && nowMs - t < RUNNER_OFFLINE_THRESHOLD_MS;
}

/**
 * Project a persisted `project_states` row into the `SessionState` shape, or
 * null when the row carries no session content. SSOT for the DB→session
 * projection — previously duplicated inline in `/api/control` (the GET fallback)
 * and the SSE stream's `dbToFastState`, which let them drift.
 */
export function dbRowToSession(r: DbProjectState | null | undefined): SessionState | null {
  if (!r || !(r.sessionDone || r.sessionNext || r.sessionStatus)) return null;
  return {
    status: r.sessionStatus ?? undefined,
    done: r.sessionDone ?? "",
    next: r.sessionNext ?? "",
    tests: r.sessionTests ?? "",
    todos: r.sessionTodos ?? "",
    health: r.sessionHealth ?? "",
    ...(r.sessionBlockReason ? { blockReason: r.sessionBlockReason } : {}),
    ...(r.sessionNoOpCount !== null && r.sessionNoOpCount !== undefined
      ? { noOpCount: r.sessionNoOpCount }
      : {}),
    mtime: r.sessionUpdatedAt?.getTime() ?? 0,
  };
}

/**
 * Resolve a project's session from its two possible sources, file-first: the
 * live `session.md` handoff (`parseSession`) wins, falling back to the persisted
 * `project_states` row when the file is absent.
 *
 * SSOT so the `/api/control` GET route and the SSE control stream can't diverge.
 * The bug this closes: on the LOCAL runtime the GET fell back to the DB row
 * (`parseSession ?? dbState`) but the SSE path (`readFastState`) was file-only —
 * so a project whose `.md` was gone but whose `project_states` row persisted
 * showed its session via GET yet `null` via the live (SSE-driven) page, hiding
 * e.g. the auto-reroute capacity banner. Both paths now call this.
 */
export function resolveProjectSession(
  fileSession: SessionState | null,
  dbRow: DbProjectState | null | undefined,
): SessionState | null {
  return fileSession ?? dbRowToSession(dbRow);
}
