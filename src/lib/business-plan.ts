import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { entities } from "@/db/schema/entities";
import { callGroqText } from "@/lib/groq";
import { fetchAttributesByEntityIds, upsertEntityAttribute } from "@/db/queries/utils";
import { getProjectPromptActivity } from "@/db/queries/prompt-history";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

/**
 * The living business plan — automatic business creation and development.
 *
 * A project profile is not a record to admire; it is the plan the fleet
 * executes against. This module turns everything FleetCrown knows about a
 * project (profile, sibling projects for synergies, recent agent activity)
 * into (a) a readable business plan and (b) concrete dispatchable actions
 * that flow into the same prompt queue the autopilot drains. Regenerating
 * folds in what happened since — the plan iterates instead of resetting.
 *
 * Storage is the existing SSOT: attributes business_plan (markdown),
 * business_actions (JSON), business_plan_updated_at (ISO date). No new
 * tables, inline-editable like every other attribute.
 */

const ActionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(2000),
});

const PlanSchema = z.object({
  plan: z.string().trim().min(50),
  actions: z.array(ActionSchema).min(1).max(8),
});

export type BusinessPlan = z.infer<typeof PlanSchema>;
export type BusinessAction = z.infer<typeof ActionSchema>;

const SYSTEM_PROMPT = `You are the business co-founder inside an AI agent fleet. Given everything known about one project — its profile, the owner's other projects (for partnerships and synergies), recent agent activity, and the previous plan if any — produce a living business plan and the next concrete actions.

Respond with ONLY a JSON object, no markdown fences:
{
  "plan": "<markdown>",
  "actions": [{ "title": "...", "prompt": "..." }, ...]
}

The "plan" markdown should be tight and skimmable (max ~600 words) with these sections (## headers): Problem & Solution, Market & Alternatives (who else solves this, competitors, substitutes), Positioning, Fleet Synergies (concrete plays with the owner's other projects), Business Model, Milestones (3-5, nearest first).

The "actions" array is the point: 4-6 prioritized, immediately executable steps that advance the BUSINESS, not just the code — e.g. drafting positioning copy, a pricing page, pilot-customer outreach, a partnership one-pager, an analytics check. Each "prompt" must be a self-contained instruction an AI agent can execute inside the project's workspace (it has the repo and can write code, docs, and content). Reference concrete file paths or pages when sensible.

Iterate, don't reset: when a previous plan is provided, keep what still holds, adjust what changed (use recent activity as evidence of progress), and never repeat actions that recent activity shows are already done. Ground every claim in the provided context plus common market knowledge — concrete, zero hype.`;

function parseModelJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("model returned no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Assemble the model context: profile + siblings + recent activity + previous plan. */
async function buildContext(userId: string, entityId: string): Promise<string | null> {
  const [project] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.id, entityId), eq(entities.userId, userId)));
  if (!project) return null;

  const attrMap = await fetchAttributesByEntityIds([entityId]);
  const attrs = attrMap.get(entityId) ?? {};

  const siblings = await db
    .select({ name: entities.name, description: entities.description })
    .from(entities)
    .where(and(eq(entities.userId, userId), eq(entities.type, "project"), ne(entities.id, entityId)));

  const activity = await getProjectPromptActivity(userId, entityId, 12).catch(() => []);

  const lines: string[] = [
    `# Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : "",
    "",
    "## Profile attributes",
    ...Object.entries(attrs)
      .filter(([k]) => !k.startsWith("business_"))
      .map(([k, v]) => `- ${k}: ${String(v).slice(0, 400)}`),
    "",
    "## The owner's other projects (synergy candidates)",
    ...siblings
      .filter((s) => s.description)
      .slice(0, 20)
      .map((s) => `- ${s.name}: ${String(s.description).slice(0, 200)}`),
    "",
    "## Recent agent activity on this project (newest first)",
    ...(activity.length
      ? activity.map((a) => `- ${a.displayText.slice(0, 160)}`)
      : ["- (no recent activity)"]),
  ];

  const previousPlan = typeof attrs["business_plan"] === "string" ? attrs["business_plan"] : "";
  if (previousPlan) {
    lines.push("", "## Previous plan (iterate on this)", previousPlan.slice(0, 4000));
  }

  return lines.filter((l) => l !== undefined).join("\n");
}

/**
 * Generate (or iterate) the plan and persist it. Returns the plan + actions,
 * or null when the entity doesn't exist / isn't the user's.
 */
export async function generateBusinessPlan(userId: string, entityId: string): Promise<BusinessPlan | null> {
  const context = await buildContext(userId, entityId);
  if (context === null) return null;

  let raw = "";
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await callGroqText(context.slice(0, 14_000), {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 2200,
        temperature: 0.3,
        timeoutMs: 45_000,
      });
      break;
    } catch (e) {
      const is429 = e instanceof Error && e.message.includes("429");
      if (!is429 || attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }

  const parsed = PlanSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) {
    throw new Error(`model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }

  const { plan, actions } = parsed.data;
  const ok1 = await upsertEntityAttribute(userId, entityId, "business_plan", plan);
  const ok2 = await upsertEntityAttribute(userId, entityId, "business_actions", JSON.stringify(actions));
  const ok3 = await upsertEntityAttribute(userId, entityId, "business_plan_updated_at", new Date().toISOString());
  if (!ok1 || !ok2 || !ok3) return null;

  scheduleProjectProfileReindexByEntityId(userId, entityId);
  return parsed.data;
}
