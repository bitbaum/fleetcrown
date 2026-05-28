import { NextRequest, NextResponse } from "next/server";
import { getProjectStatesByUserId, persistProjectRuntimeIfNewer, persistProjectSessionIfNewer } from "@/db/queries/project-states";
import { upsertRuntimeSnapshotIfNewer } from "@/db/queries/runtime-snapshots";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
import { emitStateChanged } from "@/lib/sse-bus";
import { writePromptQueueMirror } from "@/lib/prompt-queue-mirror";

interface ProjectRuntimePatch {
  tab: string;
  observedAt?: number;
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
  sessionStatus?: string;
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

  let body: { projects?: unknown; openTabs?: unknown; installedAgents?: unknown; observedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const observedAt = typeof body.observedAt === "number" && Number.isFinite(body.observedAt)
    ? new Date(body.observedAt)
    : new Date();

  if (Array.isArray(body.openTabs)) {
    const openTabs = body.openTabs.filter((tab): tab is string => typeof tab === "string" && tab.trim().length > 0);
    const installedAgents = Array.isArray(body.installedAgents)
      ? body.installedAgents.filter((agent): agent is string => typeof agent === "string" && agent.trim().length > 0)
      : undefined;
    await upsertRuntimeSnapshotIfNewer(userId, openTabs, observedAt, installedAgents)
      .catch((err) => console.error("[runtime-state] runtime snapshot write failed:", err));
  }

  if (!Array.isArray(body.projects)) {
    return NextResponse.json({ error: "projects must be an array" }, { status: 400 });
  }

  const projects = body.projects as ProjectRuntimePatch[];

  await Promise.all(projects.map(async (p) => {
    const projectObservedAt = typeof p.observedAt === "number" && Number.isFinite(p.observedAt)
      ? new Date(p.observedAt)
      : observedAt;
    await persistProjectRuntimeIfNewer({
        projectKey:             p.tab,
        userId,
        tabName:                p.tab,
        runtimeObservedAt:      projectObservedAt,
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
      }).catch((err) => console.error("[runtime-state] runtime write failed:", err));

    // Session files are timestamped at their source. Do not allow a delayed
    // heartbeat to replace newer session content already received.
    if (p.sessionUpdatedAt != null) {
      await persistProjectSessionIfNewer({
        projectKey: p.tab,
        userId,
        tabName: p.tab,
        sessionUpdatedAt: new Date(p.sessionUpdatedAt * 1000),
        ...(p.sessionStatus !== undefined && { sessionStatus: p.sessionStatus }),
        ...(p.sessionDone !== undefined && { sessionDone: p.sessionDone }),
        ...(p.sessionNext !== undefined && { sessionNext: p.sessionNext }),
        ...(p.sessionTests !== undefined && { sessionTests: p.sessionTests }),
        ...(p.sessionTodos !== undefined && { sessionTodos: p.sessionTodos }),
        ...(p.sessionHealth !== undefined && { sessionHealth: p.sessionHealth }),
      }).catch((err) => console.error("[runtime-state] session write failed:", err));
    }
  }));

  emitStateChanged(userId);

  // Keep the local hook transport mirror warm independently of the UI.
  if (isRuntimeAvailable()) {
    try {
      const states = await getProjectStatesByUserId(userId);
      for (const s of states) {
        writePromptQueueMirror(s.projectKey, s.promptQueue);
      }
    } catch (err) {
      console.error("[runtime-state] queue mirror sync failed:", err);
    }
  }

  return NextResponse.json({ ok: true, count: projects.length });
}
