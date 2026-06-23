import type { SessionState } from "@/lib/control-types";
import type { ProjectState as DbProjectState } from "@/db/schema/project-states";

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
