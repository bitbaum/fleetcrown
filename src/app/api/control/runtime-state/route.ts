import { NextRequest, NextResponse } from "next/server";
import { upsertProjectState } from "@/db/queries/project-states";
import { getApiUserId } from "@/lib/session";
import { emitStateChanged } from "@/lib/sse-bus";

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
//
// All rows are scoped to the authenticated user — the daemon services one user at
// a time and may only mutate its own runtime state. Previous versions resolved
// ownership by global project-name lookup, which silently merged state across
// tenants when two users had a project with the same name.
export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  await Promise.all(
    projects.map((p) =>
      upsertProjectState({
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
      }).catch((err) => console.error("[runtime-state] db write failed:", err)),
    ),
  );

  emitStateChanged(userId);

  return NextResponse.json({ ok: true, count: projects.length });
}
