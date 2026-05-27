import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { stateFile } from "@/lib/agent-config";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { getProjectState, upsertProjectState } from "@/db/queries/project-states";

// Queue storage as of migration 0010: project_states.prompt_queue is the
// source of truth — persists across browsers and Vercel cold starts.
// /tmp/agent-queue-<tab> is still written so scripts/agent-hook-bridge.sh
// (which reads /tmp directly and can't easily query the DB from bash)
// keeps working. User has historically denied edits to that file, so the
// file mirror stays until that path's been touched separately.

async function readQueueFromDb(userId: string, tab: string): Promise<{ queue: string[]; exists: boolean }> {
  const row = await getProjectState(userId, tab);
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
  await upsertProjectState({
    userId,
    projectKey: key,
    tabName: tab,
    promptQueue: bodyOrResp.queue,
  });

  writeQueueFile(key, bodyOrResp.queue);
  return NextResponse.json({ ok: true });
}
