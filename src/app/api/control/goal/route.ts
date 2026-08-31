/**
 * POST /api/control/goal — set a project's goal-mode config: its Definition of
 * Done (the bar the cross-model DoD gate judges against) and an optional turn
 * cap (`goal_max_turns`, how many times the loop re-tries before escalating).
 *
 * These are plain project-entity attributes, so the existing DoD gate
 * (src/lib/orchestration/dod-gate.ts, sourced via getProjectGoalConfig) picks
 * them up on the next run close — no other wiring. Session-scoped to the owner.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities } from "@/db/schema/entities";
import { ENTITY_TYPE } from "@/lib/constants/statuses";
import { upsertEntityAttribute } from "@/db/queries/utils";
import { getSessionUserId } from "@/lib/session";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

const Body = z.object({
  projectKey: z.string().trim().min(1),
  // Empty string clears the bar; omit to leave unchanged.
  definitionOfDone: z.string().trim().max(300).optional(),
  // 0 or null clears the cap (loop until met); 1–20 caps the loop.
  maxTurns: z.number().int().min(0).max(20).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { projectKey, definitionOfDone, maxTurns } = parsed.data;

  // Resolve the project entity by name (case-insensitive), matching how the DoD
  // gate resolves it in getProjectGoalConfig.
  const rows = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)));
  const entity = rows.find((e) => e.name.toLowerCase() === projectKey.toLowerCase());
  if (!entity) return NextResponse.json({ error: "project not found" }, { status: 404 });

  if (definitionOfDone !== undefined) {
    await upsertEntityAttribute(userId, entity.id, "definition_of_done", definitionOfDone);
  }
  if (maxTurns !== undefined) {
    await upsertEntityAttribute(
      userId,
      entity.id,
      "goal_max_turns",
      maxTurns ? String(maxTurns) : "",
    );
  }

  scheduleProjectProfileReindexByEntityId(userId, entity.id);

  return NextResponse.json({ ok: true });
}
