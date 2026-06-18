/**
 * Project context for autonomous dispatch — SSOT for "what is this project trying
 * to achieve". Returns the project's brief (entity description) + its active goals
 * (the roadmap), formatted for injection into the agent's prompt so "next best"
 * is judged against the actual goals instead of being generic.
 *
 * Reused by the orchestration render path (renderTaskForAdapter callers) and the
 * nudge-idle cron — one source, so the autopilot always aims at the same context
 * the operator sees in the product (Projects brief + Goals).
 */
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { entities, goals } from "@/db/schema";
import type { Milestone } from "@/db/schema/goals";
import { ENTITY_TYPE, GOAL_STATUS } from "@/lib/constants/statuses";

const MAX_GOALS = 6;

/**
 * Formatted brief + active goals for a project, or null when the project has no
 * description and no active goals (so callers can omit the section entirely).
 */
export async function getProjectContext(userId: string, projectKey: string): Promise<string | null> {
  // Resolve the project entity by name (case-insensitive, matching the inject
  // route's own canonical-tab resolution).
  const projectEntities = await db
    .select({ id: entities.id, name: entities.name, description: entities.description })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)));
  const entity = projectEntities.find((e) => e.name.toLowerCase() === projectKey.toLowerCase());
  if (!entity) return null;

  const activeGoals = await db
    .select({ title: goals.title, progress: goals.progress, milestones: goals.milestones })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.entityId, entity.id), eq(goals.status, GOAL_STATUS.ACTIVE)))
    .orderBy(desc(goals.updatedAt))
    .limit(MAX_GOALS);

  const lines: string[] = [];
  // Some projects store their filesystem path in `description` — that's noise in
  // a prompt, so only include a real, prose brief (not a path).
  const briefText = entity.description?.trim();
  if (briefText && !briefText.startsWith("/")) lines.push(briefText);
  if (activeGoals.length > 0) {
    lines.push("Active goals (the roadmap — aim work at these, highest-impact first):");
    for (const g of activeGoals) {
      const nextMilestone = Array.isArray(g.milestones)
        ? (g.milestones as Milestone[]).find((m) => !m.done)?.title
        : undefined;
      const progress = typeof g.progress === "number" ? ` (${g.progress}%)` : "";
      const next = nextMilestone ? ` — next: ${nextMilestone}` : "";
      lines.push(`- ${g.title}${progress}${next}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
