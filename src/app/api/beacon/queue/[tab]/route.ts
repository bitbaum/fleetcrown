import { NextRequest, NextResponse } from "next/server";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { getApiUserId } from "@/lib/session";
import { consumeProjectPrompt, getProjectState, replaceProjectPromptQueue } from "@/db/queries/project-states";
import { writePromptQueueMirror } from "@/lib/prompt-queue-mirror";

// Queue storage as of migration 0010: project_states.prompt_queue is the
// source of truth — persists across browsers and Vercel cold starts.
// /tmp/agent-queue-<tab> remains a local-runtime transport mirror for shell
// hooks. Mutations are applied to DB first and mirrored only after success.

async function readQueueFromDb(userId: string, tab: string): Promise<{ queue: string[]; revision: number; exists: boolean }> {
  const row = await getProjectState(userId, tab);
  if (!row) return { queue: [], revision: 0, exists: false };
  return { queue: row.promptQueue ?? [], revision: row.promptQueueRevision, exists: true };
}

const PutBody = z.object({
  queue: z.array(z.string().max(4000)).max(200),
  expectedRevision: z.number().int().min(0),
});

const ConsumeBody = z.object({
  consumed: z.string().trim().min(1).max(4000),
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
  const result = await replaceProjectPromptQueue(userId, key, tab, bodyOrResp.queue, bodyOrResp.expectedRevision);
  if (!result.applied) {
    return NextResponse.json({ queue: result.queue, revision: result.revision, exists: result.exists, conflict: true }, { status: 409 });
  }

  writePromptQueueMirror(key, result.queue);
  return NextResponse.json({ ok: true, queue: result.queue, revision: result.revision, exists: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bodyOrResp = await readJsonBody(req, ConsumeBody);
  if (bodyOrResp instanceof NextResponse) return bodyOrResp;

  const key = tab.toLowerCase();
  const result = await consumeProjectPrompt(userId, key, bodyOrResp.consumed);
  writePromptQueueMirror(key, result.queue);
  return NextResponse.json({
    ok: true,
    consumed: result.consumed,
    queue: result.queue,
    revision: result.revision,
    exists: result.exists,
  });
}
