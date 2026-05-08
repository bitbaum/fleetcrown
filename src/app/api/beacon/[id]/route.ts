import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { sql, and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { userProjects } from "@/db/schema";
import { getCurrentUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import { beaconPath, readBeaconSession } from "@/app/api/beacon/route";
import { parseSessionText } from "@/lib/session-content";
import type { DevLogEntry } from "@/db/schema/user-projects";

const RespondBody = z.object({
  choice: z.string().min(1).max(2000),
});

async function appendDevLog(projectName: string, content: string): Promise<void> {
  if (!content.trim()) return;
  const parsed = parseSessionText(content);
  if (!parsed.done.length && !parsed.next.length) return;

  const userId = await getCurrentUserId();
  const project = await db.query.userProjects.findFirst({
    where: and(eq(userProjects.userId, userId), ilike(userProjects.name, projectName)),
    columns: { id: true },
  });
  if (!project) return;

  const entry: DevLogEntry = {
    date: new Date().toISOString(),
    done: parsed.done.join("; "),
    next: parsed.next.join("; "),
    tests: parsed.tests,
    todos: parsed.todos,
    health: parsed.health || "good",
  };
  await db
    .update(userProjects)
    .set({ devLog: sql`coalesce(${userProjects.devLog}, '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb` })
    .where(eq(userProjects.id, project.id));
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
