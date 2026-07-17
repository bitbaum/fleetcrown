// Cross-page project inventory for the Sessions drawer (added 2026-06-05).
//
// Returns a lightweight snapshot of every project the signed-in user owns,
// joined with the latest project_states row (if any) so the drawer can
// render a status dot + last activity per project without bloating the
// payload like /api/control does.
//
// Why a separate endpoint vs reusing /api/control?
//   - /api/control is /control-page-specific: pulls zellij tabs, runs git
//     status on every project dir, returns agent process info etc.
//     ~50KB+ payload per call. Sessions drawer is visible on every
//     authenticated page (today, people, money…) and polls every 30s, so
//     it must stay tiny.
//   - This endpoint is read-only and DB-only — no shell-outs, no git, no
//     runner dependency. Cheap to call frequently.

import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getProjects } from "@/db/queries/projects";
import { getProjectStatesByUserId } from "@/db/queries/project-states";
import { SESSION_STATUS } from "@/lib/constants/statuses";

export type SessionSnapshotItem = {
  id: string;
  name: string;
  gitUrl: string | null;
  /** Last persisted state from project_states, or null if the project has
   *  never been touched by a runner. */
  state: {
    /** Coarse phase derived from project_states. */
    phase: "working" | "ready" | "open_idle" | "closed" | "offline" | "unknown";
    /** ISO timestamp of the last project_states.updated_at — null for never-tracked. */
    lastActivity: string | null;
    /** zellij tab name (where the project's agent runs), if known. */
    tab: string | null;
  };
};

export type SessionSnapshot = {
  projects: SessionSnapshotItem[];
  generatedAt: string;
};

// Map project_states fields to a coarse phase for the drawer. Mirrors
// (loosely) the logic in components/control/control-presenter.ts but kept
// inline here so the snapshot endpoint doesn't need to import the heavy
// presenter module.
function derivePhase(
  state: {
    sessionStatus: string | null;
    agentRunning: boolean;
    tabOpen: boolean;
    closedAt: Date | null;
    updatedAt: Date;
  },
): SessionSnapshotItem["state"]["phase"] {
  if (state.closedAt) return "closed";
  if (state.agentRunning) return "working";
  if (state.sessionStatus === SESSION_STATUS.READY) return "ready";
  if (state.sessionStatus === SESSION_STATUS.WORKING) return "working";

  const age = Date.now() - state.updatedAt.getTime();
  if (age > 5 * 60 * 1000) return "offline";
  if (state.tabOpen) return "open_idle";
  return "unknown";
}

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [projects, states] = await Promise.all([
    getProjects(userId),
    getProjectStatesByUserId(userId).catch(() => []),
  ]);

  // Index project_states by project_key for O(1) lookup. project_key matches
  // the tab name OR the project entity name (the runner writes whichever
  // it sees first; both are fine as join keys here).
  const stateByKey = new Map<string, (typeof states)[number]>();
  for (const s of states) {
    if (s.projectKey) stateByKey.set(s.projectKey.toLowerCase(), s);
  }

  const items: SessionSnapshotItem[] = projects.map((p) => {
    // Try project_states by name (lowercased) — that's the most common
    // join the runner writes.
    const s = stateByKey.get(p.name.toLowerCase());
    return {
      id: p.id,
      name: p.name,
      gitUrl: p.gitUrl ?? null,
      state: s
        ? {
            phase: derivePhase({
              sessionStatus: s.sessionStatus ?? null,
              agentRunning: s.agentRunning,
              tabOpen: s.tabOpen,
              closedAt: s.closedAt ?? null,
              updatedAt: s.updatedAt,
            }),
            lastActivity: s.updatedAt.toISOString(),
            tab: s.tabName ?? s.projectKey,
          }
        : {
            phase: "unknown" as const,
            lastActivity: null,
            tab: null,
          },
    };
  });

  return NextResponse.json({
    projects: items,
    generatedAt: new Date().toISOString(),
  });
}
