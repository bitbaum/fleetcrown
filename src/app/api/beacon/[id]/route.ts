import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getSessionUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { beaconPath, readBeaconSession } from "@/app/api/beacon/route";
import { parseSessionText } from "@/lib/session-content";
import { appendProjectDevLog } from "@/db/queries/user-projects";

const RespondBody = z.object({
  choice: z.string().min(1).max(2000),
});

async function appendDevLog(projectName: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const parsed = parseSessionText(content);
  if (!parsed.done.length && !parsed.next.length) return;

  const userId = await getSessionUserId();
  if (!userId) return; // unauthenticated — skip logging, don't fail the beacon response
  await appendProjectDevLog(userId, projectName, {
    date: new Date().toISOString(),
    done: parsed.done.join("; "),
    next: parsed.next.join("; "),
    tests: parsed.tests,
    todos: parsed.todos,
    health: parsed.health || "good",
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readBeaconSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = readBeaconSession(id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataOrResp = await readJsonBody(req, RespondBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;

  session.choice = dataOrResp.choice;
  fs.writeFileSync(beaconPath(id), JSON.stringify(session));

  // Persist session state to project dev log (fire-and-forget — never blocks the beacon response)
  appendDevLog(session.project, session.sessionContent).catch(() => {});

  return NextResponse.json({ ok: true });
}
