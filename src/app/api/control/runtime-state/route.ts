import { NextRequest, NextResponse } from "next/server";
import { upsertProjectState } from "@/db/queries/project-states";
import { getUserIdsByProjectNames } from "@/db/queries/user-projects";
import { getApiUserId } from "@/lib/session";

interface ProjectRuntimePatch {
  tab: string;
  agentRunning: boolean;
  tabOpen: boolean;
  activeAgents: string[];
  currentPromptKey?: string | null;
  currentPromptLabel?: string | null;
  currentPromptStartedAt?: number | null; // epoch seconds
  readyAt?: number | null;                // epoch seconds
  lockAt?: number | null;                 // epoch seconds
  closingAt?: number | null;
  closedAt?: number | null;
  sessionDone?: string;
  sessionNext?: string;
  sessionTests?: string;
  sessionTodos?: string;
  sessionHealth?: string;
  sessionUpdatedAt?: number | null;       // epoch seconds (file mtime)
}

function tsOrNull(epochS: number | null | undefined): Date | null {
  return epochS != null ? new Date(epochS * 1000) : null;
}

// POST /api/control/runtime-state
// Bearer-authenticated (env token or ck_* agent token).
// Pushes local agent runtime state into the DB so the cloud control plane can read it.
export async function POST(req: NextRequest) {
  const daemonUserId = await getApiUserId();
  if (!daemonUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { projects?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.projects)) {
    return NextResponse.json({ error: "projects must be an array" }, { status: 400 });
  }

  const projects = body.projects as ProjectRuntimePatch[];

  // Resolve the actual owning userId per project by looking up user_projects.
  // This ensures state is stored under the right user even when the owner's
  // session account differs from the daemon's default-user account (e.g. GitHub OAuth
  // created a separate row from the initial local-password setup).
  const ownerMap = await getUserIdsByProjectNames(projects.map((p) => p.tab)).catch(() => new Map<string, string>());

  await Promise.all(
    projects.map((p) => {
      const userId = ownerMap.get(p.tab.toLowerCase()) ?? daemonUserId;
      return upsertProjectState({
        projectKey:             p.tab,
        userId,
        tabName:                p.tab,
        agentRunning:           p.agentRunning,
        tabOpen:                p.tabOpen,
        activeAgents:           p.activeAgents,
        currentPromptKey:       p.currentPromptKey   ?? null,
        currentPromptLabel:     p.currentPromptLabel  ?? null,
        currentPromptStartedAt: tsOrNull(p.currentPromptStartedAt),
        readyAt:                tsOrNull(p.readyAt),
        lockAt:                 tsOrNull(p.lockAt),
        closingAt:              tsOrNull(p.closingAt),
        closedAt:               tsOrNull(p.closedAt),
        // Session content — only included when the daemon read a session file.
        // undefined means "leave DB value as-is"; present string means "update."
        ...(p.sessionDone     !== undefined && { sessionDone:     p.sessionDone }),
        ...(p.sessionNext     !== undefined && { sessionNext:     p.sessionNext }),
        ...(p.sessionTests    !== undefined && { sessionTests:    p.sessionTests }),
        ...(p.sessionTodos    !== undefined && { sessionTodos:    p.sessionTodos }),
        ...(p.sessionHealth   !== undefined && { sessionHealth:   p.sessionHealth }),
        ...(p.sessionUpdatedAt !== undefined && { sessionUpdatedAt: tsOrNull(p.sessionUpdatedAt) }),
      }).catch((err) => console.error("[runtime-state] db write failed:", err));
    })
  );

  return NextResponse.json({ ok: true, count: projects.length });
}
