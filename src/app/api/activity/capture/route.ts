// POST /api/activity/capture
//
// Records a prompt the user typed directly into a Claude (or other agent) tab
// in the terminal — bypassing the platform's dispatch path. Called by the
// Claude UserPromptSubmit hook so the activity view reflects ALL agent work,
// not just dispatches routed through /api/inject or /api/orchestration/run.
//
// Auth: Bearer token (FLEETCROWN_DAEMON_TOKEN). Lives outside the cookie
// session — Claude hooks run as plain shell scripts with no browser context.

import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import path from "node:path";
import { insertPromptHistory } from "@/db/queries/prompt-history";
import { db } from "@/db";
import { userProjects } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const MIN_PROMPT_CHARS = 8;       // skip "yes" / "ok" / "continue" noise
const MAX_PROMPT_CHARS = 8000;    // hard cap mirrors prompt_history.custom_prompt + headroom

const Body = z.object({
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  cwd: z.string().min(1).max(500),
  projectKey: z.string().optional(),
  sessionId: z.string().optional(),
});

// Resolve a project from a working directory: prefer an explicit projectKey
// from the hook; otherwise match userProjects.directory (or fall back to the
// last path segment as the tab name).
async function resolveProject(userId: string, cwd: string, projectKeyHint: string | undefined) {
  if (projectKeyHint) {
    const row = await db
      .select({ entityProjectId: userProjects.entityProjectId, name: userProjects.name, dirPath: userProjects.dirPath })
      .from(userProjects)
      .where(and(eq(userProjects.userId, userId), eq(userProjects.name, projectKeyHint)))
      .limit(1);
    if (row[0]) return { projectId: row[0].entityProjectId ?? null, projectKey: row[0].name, projectPath: row[0].dirPath ?? cwd };
  }
  // Match against any user_projects.directory that is the cwd or an ancestor.
  const rows = await db
    .select({ entityProjectId: userProjects.entityProjectId, name: userProjects.name, dirPath: userProjects.dirPath })
    .from(userProjects)
    .where(eq(userProjects.userId, userId));
  let best: { entityProjectId: string | null; name: string; dirPath: string } | null = null;
  for (const row of rows) {
    if (!row.dirPath) continue;
    if (cwd === row.dirPath || cwd.startsWith(row.dirPath + path.sep)) {
      if (!best || row.dirPath.length > best.dirPath.length) {
        best = { entityProjectId: row.entityProjectId ?? null, name: row.name, dirPath: row.dirPath };
      }
    }
  }
  if (best) return { projectId: best.entityProjectId ?? null, projectKey: best.name, projectPath: best.dirPath };
  // Fall back to the directory's basename as the tab-name-style key. The row
  // gets recorded anyway so the user can audit unmatched work later.
  const basename = path.basename(cwd);
  return { projectId: null, projectKey: basename || "unknown", projectPath: cwd };
}

export async function POST(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonBody(req, Body);
  if (parsed instanceof NextResponse) return parsed;

  const prompt = parsed.prompt.trim();
  if (prompt.length < MIN_PROMPT_CHARS) {
    // Noise filter — "yes", "continue", "ok", "what?" don't belong in the
    // activity log. Returns 200 so the hook stays quiet about it.
    return NextResponse.json({ skipped: "below_min_length" });
  }

  const project = await resolveProject(userId, parsed.cwd, parsed.projectKey);

  await insertPromptHistory(userId, {
    projectId: project.projectId,
    projectKey: project.projectKey,
    projectPath: project.projectPath,
    adapter: "claude",
    intent: "custom",
    customPrompt: prompt,
    resolvedPrompt: prompt,
  });

  return NextResponse.json({ ok: true, project: project.projectKey });
}
