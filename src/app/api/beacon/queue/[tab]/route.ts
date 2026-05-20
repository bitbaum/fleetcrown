import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { eq, and } from "drizzle-orm";
import { stateFile } from "@/lib/agent-config";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { db } from "@/db";
import { projectStates } from "@/db/schema/project-states";

// Queue storage as of migration 0010: project_states.prompt_queue is the
// source of truth — persists across browsers and Vercel cold starts.
// /tmp/agent-queue-<tab> is still written so scripts/agent-hook-bridge.sh
// (which reads /tmp directly and can't easily query the DB from bash)
// keeps working. User has historically denied edits to that file, so the
// file mirror stays until that path's been touched separately.

async function readQueueFromDb(userId: string, tab: string): Promise<{ queue: string[]; exists: boolean }> {
  // Tab is the project key in project_states. Schema lowercases on lookup
  // matching the existing convention used elsewhere (agent-projects.conf
  // and the file path).
  const [row] = await db
    .select({ promptQueue: projectStates.promptQueue })
    .from(projectStates)
    .where(and(eq(projectStates.userId, userId), eq(projectStates.projectKey, tab)))
    .limit(1);
  if (!row) return { queue: [], exists: false };
  return { queue: row.promptQueue ?? [], exists: true };
}

function writeQueueFile(tab: string, queue: string[]): void {
  // Best-effort: file mirror for the bash stop hook. Vercel /tmp is
  // ephemeral so this is a no-op there; local cockpit-app machines see
  // the file persist across cockpit-app restarts (until /tmp clears).
  try {
    const p = stateFile.queue(tab);
    fs.writeFileSync(p + ".tmp", JSON.stringify(queue));
    fs.renameSync(p + ".tmp", p);
  } catch { /* mirror failure is non-fatal — DB is the source of truth */ }
}

const PutBody = z.object({
  queue: z.array(z.string().max(4000)).max(200),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await readQueueFromDb(userId, tab.toLowerCase()));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyOrResp = await readJsonBody(req, PutBody);
  if (bodyOrResp instanceof NextResponse) return bodyOrResp;

  const key = tab.toLowerCase();
  // Upsert: row may not exist yet for a project the user just registered.
  // ON CONFLICT (user_id, project_key) is the existing PK from migration
  // 0002 — drizzle's onConflictDoUpdate maps cleanly.
  await db
    .insert(projectStates)
    .values({
      userId,
      projectKey: key,
      tabName: tab,                // preserve original case for display
      promptQueue: bodyOrResp.queue,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [projectStates.userId, projectStates.projectKey],
      set: { promptQueue: bodyOrResp.queue, updatedAt: new Date() },
    });

  writeQueueFile(key, bodyOrResp.queue);
  return NextResponse.json({ ok: true });
}
