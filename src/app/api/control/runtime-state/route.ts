import { NextRequest, NextResponse } from "next/server";
import { upsertProjectState } from "@/db/queries/project-states";
import { isDaemonRequest, getDaemonUserId } from "@/lib/daemon-auth";

interface ProjectRuntimePatch {
  tab: string;
  agentRunning: boolean;
  activeAgents: string[];
  currentPromptKey?: string | null;
  currentPromptLabel?: string | null;
  currentPromptStartedAt?: number | null; // epoch seconds
  readyAt?: number | null;                // epoch seconds
  lockAt?: number | null;                 // epoch seconds
  closingAt?: number | null;
  closedAt?: number | null;
}

function tsOrNull(epochS: number | null | undefined): Date | null {
  return epochS != null ? new Date(epochS * 1000) : null;
}

// POST /api/control/runtime-state
// Daemon-only: accepts Bearer COCKPIT_DAEMON_TOKEN.
// Pushes local agent runtime state into the DB so the cloud control plane can read it.
export async function POST(req: NextRequest) {
  if (!isDaemonRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getDaemonUserId();
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
        activeAgents:           p.activeAgents,
        currentPromptKey:       p.currentPromptKey   ?? null,
        currentPromptLabel:     p.currentPromptLabel  ?? null,
        currentPromptStartedAt: tsOrNull(p.currentPromptStartedAt),
        readyAt:                tsOrNull(p.readyAt),
        lockAt:                 tsOrNull(p.lockAt),
        closingAt:              tsOrNull(p.closingAt),
        closedAt:               tsOrNull(p.closedAt),
      }).catch(() => {})
    )
  );

  return NextResponse.json({ ok: true, count: projects.length });
}
