import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { upsertProjectState, getProjectStatesByUserId } from "@/db/queries/project-states";
import { upsertRuntimeSnapshot } from "@/db/queries/runtime-snapshots";
import { stateFile } from "@/lib/agent-config";
import { getApiUserId } from "@/lib/session";
import { isRuntimeAvailable } from "@/lib/runtime";
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

  let body: { projects?: unknown; openTabs?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Array.isArray(body.openTabs)) {
    const openTabs = body.openTabs.filter((tab): tab is string => typeof tab === "string" && tab.trim().length > 0);
    await upsertRuntimeSnapshot(userId, openTabs).catch((err) => console.error("[runtime-state] openTabs write failed:", err));
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

  // Background queue sync: every daemon push (every ~60s via heartbeat or
  // sooner on state change) mirrors each project's DB prompt_queue out to
  // /tmp/agent-queue-<tab>. Closes the gap left by 58e4366 — that fix only
  // synced during /api/control GET (the UI poll), so /tmp went stale once
  // the user closed the browser tab. Now the daemon keeps the local
  // mirror warm independently of whether anyone's looking at the page.
  // Gated on isRuntimeAvailable() so Vercel serverless never touches /tmp
  // (no point — its /tmp is ephemeral and there's no bash hook there).
  if (isRuntimeAvailable()) {
    try {
      const states = await getProjectStatesByUserId(userId);
      // Defensive against duplicate rows that share the same lowercase
      // project_key (e.g. 'cockpit' vs 'Cockpit' — caught on 2026-05-20
      // because the iteration order let an empty-queue dup overwrite the
      // real queue's mirror file). Group by lowercase key and pick the
      // row with the longest prompt_queue; ties keep first-seen.
      const byKey = new Map<string, typeof states[number]>();
      for (const s of states) {
        if (!s.projectKey) continue;
        const k = s.projectKey.toLowerCase();
        const cur = byKey.get(k);
        const sLen = s.promptQueue?.length ?? 0;
        const curLen = cur?.promptQueue?.length ?? 0;
        if (!cur || sLen > curLen) byKey.set(k, s);
      }
      for (const [k, s] of byKey) {
        try {
          const p = stateFile.queue(k);
          fs.writeFileSync(p + ".tmp", JSON.stringify(s.promptQueue ?? []));
          fs.renameSync(p + ".tmp", p);
        } catch { /* per-file failure is non-fatal */ }
      }
    } catch (err) {
      console.error("[runtime-state] queue mirror sync failed:", err);
    }
  }

  return NextResponse.json({ ok: true, count: projects.length });
}
