import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { callGroqText } from "@/lib/groq";
import { db } from "@/db";
import { attributes, entities } from "@/db/schema";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { patchProject } from "@/db/queries/projects";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";

/**
 * AI-powered project profile extraction — the "no forms" path.
 *
 * People hate filling out forms. Instead of asking for mission/vision/
 * customers/stack field by field, the user writes (or dictates) what they
 * want the project to be in free form — or we read the project's own README —
 * and the model fills the profile. The output lands in the exact same SSOT
 * the form would write to: entities.description + the attributes table, so
 * everything downstream (ProjectOverviewTab, control cards, dispatch context)
 * sees it with zero new storage.
 *
 * Both intake routes (/api/projects/[id]/brief for free text,
 * /api/projects/[id]/enrich for repo READMEs) funnel through here.
 */

/** Profile fields the extractor may fill. Mirrors the suggested/reserved
 *  attribute keys ProjectOverviewTab already renders. */
const FIELD_LIMIT = 500;

export const ExtractedProfileSchema = z.object({
  description: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  mission: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  vision: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  customers: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  stack: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  status: z.string().trim().min(1).max(60).optional(),
  next_step: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  // Build-execution lens — how an agent should build this project correctly.
  // Injected into every autopilot dispatch (project-context.ts DRIVING_FIELDS),
  // so the project is driven in the right direction without re-deriving each run.
  architecture: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  conventions: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  definition_of_done: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  // Market lens — the "nerd out on your project" dimensions. Same storage
  // (attributes table), so they're inline-editable like everything else.
  problem: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  solution: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  current_alternatives: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  competitors: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  complements_substitutes: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  partnerships: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  potential_customers: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
  expansion_ideas: z.string().trim().min(1).max(FIELD_LIMIT).optional(),
});

export type ExtractedProfile = z.infer<typeof ExtractedProfileSchema>;

const SYSTEM_PROMPT = `You turn free-form notes about a software/business project into a structured profile.
Respond with ONLY a JSON object — no prose, no markdown fences. Allowed keys:
- "description": what the project is, 1-2 plain sentences (max 400 chars)
- "mission": why it exists — the problem it solves and for whom (max 400 chars)
- "vision": what it should become at full ambition (max 400 chars)
- "customers": who it serves / who pays (max 300 chars)
- "stack": technologies used, comma-separated (max 200 chars)
- "status": current state in 1-4 words, e.g. "Production", "MVP", "Idea" (max 40 chars)
- "next_step": the owner's single most important next build/business action (max 300 chars) — never installation or usage instructions aimed at readers
- "architecture": the key building blocks and how they fit — main modules/services, data stores, external integrations (max 400 chars). Only from the text/README; omit if unknown.
- "conventions": how this project is built — patterns, rules, do's and don'ts an engineer must follow (e.g. "Drizzle not Prisma", "server components by default", "never edit generated files") (max 400 chars). Only from the text/README; omit if unknown.
- "definition_of_done": the bar a change must clear to be finished — e.g. "tsc + lint clean, tests pass, deploys green" (max 300 chars). Only from the text/README; omit if unknown.
- "problem": the concrete problem being solved, from the user's point of view (max 400 chars)
- "solution": how this project solves that problem — the offered approach (max 400 chars)
- "current_alternatives": how people solve this problem today without the project (max 400 chars)
- "competitors": direct competitors, comma-separated, with a word on each if known (max 400 chars)
- "complements_substitutes": products that complement it or could substitute for it (max 400 chars)
- "partnerships": potential partnerships and synergies — including with the owner's other projects when the text mentions them (max 400 chars)
- "potential_customers": customer segments worth pursuing beyond current ones (max 400 chars)
- "expansion_ideas": plausible product expansions or adjacent offerings (max 400 chars)
For the market-lens keys (problem … expansion_ideas) you may reason from the text plus common knowledge of the market, but stay concrete and grounded — no hype. For all other keys, NEVER invent facts that are not in the text.
Omit any key you have no basis for. Write in the same language as the source text uses for prose (default English).`;

/** Strip optional markdown fences and parse the model's JSON answer. */
function parseModelJson(raw: string): unknown {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("model returned no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Clamp every string field to its schema max instead of rejecting — the
 *  model occasionally runs a few chars over and a hard fail wastes the call. */
function clampFields(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const limits: Record<string, number> = { status: 60 };
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = typeof v === "string" ? v.slice(0, limits[key] ?? FIELD_LIMIT) : v;
  }
  return out;
}

/**
 * Extract a structured profile from free-form text (user brief, README, …).
 * Throws on Groq/parse failure — callers map that to a 502.
 */
export async function extractProjectProfile(projectName: string, sourceText: string): Promise<ExtractedProfile> {
  const prompt = `Project name: ${projectName}\n\nSource text:\n${sourceText.slice(0, 12_000)}`;
  let raw = "";
  // Groq free tier rate-limits in bursts; one bounded retry absorbs the
  // common 429 without turning a user-facing request into a hang.
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await callGroqText(prompt, {
        systemPrompt: SYSTEM_PROMPT,
        maxTokens: 900,
        temperature: 0.2,
        timeoutMs: 25_000,
      });
      break;
    } catch (e) {
      const is429 = e instanceof Error && e.message.includes("429");
      if (!is429 || attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  const parsed = ExtractedProfileSchema.safeParse(clampFields(parseModelJson(raw)));
  if (!parsed.success) throw new Error(`model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return parsed.data;
}

// ── Roadmap decomposition (spec → milestones) ────────────────────────────────
// The brief flow fills flat fields; this turns a spec into an ordered build
// roadmap the caller creates as project goals. This is the "decompose the doc"
// half of spec ingestion.

export const RoadmapSchema = z.object({
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        // Description carries the acceptance criteria — the bar that milestone
        // must clear — so each goal is verifiable, not vague.
        description: z.string().trim().max(500).optional(),
      }),
    )
    .max(8),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

const ROADMAP_SYSTEM = `You turn a product/engineering spec into an ordered BUILD ROADMAP.
Respond with ONLY a JSON object — no prose, no markdown fences:
{"milestones":[{"title":"...","description":"..."}]}

Rules:
- 3 to 7 milestones, ordered so each builds on the last and is independently shippable.
- "title": one imperative line naming the deliverable (max 100 chars), e.g. "Define the core data model".
- "description": 1-2 sentences INCLUDING the acceptance criteria — the objective bar that milestone must clear to be done (max 400 chars).
- Derive from the spec's own roadmap/phases/milestones if it states them; otherwise infer a sensible build order from its scope.
- Milestones are engineering deliverables, not marketing. No installation/usage instructions.`;

// ── Reconcile (sync fields from an updated doc) ───────────────────────────────
// Instead of overwriting every field, diff the project's CURRENT fields against
// an updated doc and return a PATCH: only the fields whose value should change,
// plus up to 3 proposed NEW attributes for important facts that don't fit the
// existing schema. The caller previews this and applies only what the user OKs —
// so manual edits survive and nothing is silently clobbered.

export const ReconcilePatchSchema = z.object({
  // Only fields whose value should change, keyed by existing field/attribute key.
  updates: z.record(z.string(), z.string().trim().min(1).max(FIELD_LIMIT)).default({}),
  // Proposed new custom attributes — capped, snake_case, user-approved before write.
  newAttributes: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "key must be snake_case"),
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().min(1).max(FIELD_LIMIT),
      }),
    )
    .max(3)
    .default([]),
});
export type ReconcilePatch = z.infer<typeof ReconcilePatchSchema>;

const RECONCILE_SYSTEM = `You reconcile a project's structured fields with an UPDATED document.
You are given the CURRENT fields ("key: value" per line) and the UPDATED doc. Return ONLY a JSON patch:
{"updates": {"<existing_key>": "<new value>"}, "newAttributes": [{"key":"snake_case","label":"Human Label","value":"..."}]}

Rules:
- "updates": include ONLY fields whose value should CHANGE given the doc. OMIT unchanged fields entirely. Never touch a field the doc doesn't speak to. Keep each value concise (max 400 chars), matching the existing style.
- "newAttributes": propose AT MOST 3 new fields for important facts in the doc that fit no existing key (e.g. pricing_model, moat, compliance, go_to_market). snake_case key + short human label. Omit if nothing warrants it.
- Never invent facts absent from the doc. Never delete fields.`;

/** Diff current fields against an updated doc → a patch (changed fields + proposed new ones). Throws on Groq/parse failure. */
export async function reconcileProfile(
  projectName: string,
  currentFields: Record<string, string>,
  newDoc: string,
): Promise<ReconcilePatch> {
  const current = Object.entries(currentFields)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const prompt = `Project: ${projectName}\n\nCURRENT FIELDS:\n${current || "(none yet)"}\n\nUPDATED DOC:\n${newDoc.slice(0, 12_000)}`;
  let raw = "";
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await callGroqText(prompt, {
        systemPrompt: RECONCILE_SYSTEM,
        maxTokens: 1600,
        temperature: 0.2,
        timeoutMs: 25_000,
      });
      break;
    } catch (e) {
      const is429 = e instanceof Error && e.message.includes("429");
      if (!is429 || attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  const parsed = ReconcilePatchSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) throw new Error(`reconcile output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return parsed.data;
}

/** Extract an ordered build roadmap (milestones) from spec text. Throws on Groq/parse failure. */
export async function extractRoadmap(projectName: string, sourceText: string): Promise<Roadmap> {
  const prompt = `Project name: ${projectName}\n\nSpec:\n${sourceText.slice(0, 12_000)}`;
  let raw = "";
  for (let attempt = 0; ; attempt++) {
    try {
      raw = await callGroqText(prompt, {
        systemPrompt: ROADMAP_SYSTEM,
        maxTokens: 1200,
        temperature: 0.2,
        timeoutMs: 25_000,
      });
      break;
    } catch (e) {
      const is429 = e instanceof Error && e.message.includes("429");
      if (!is429 || attempt >= 1) throw e;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  const parsed = RoadmapSchema.safeParse(parseModelJson(raw));
  if (!parsed.success) throw new Error(`roadmap output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  return parsed.data;
}

/**
 * Write an extracted profile to the project's SSOT: description on the
 * entity row, everything else as attributes. Returns the applied fields
 * (so the UI can show exactly what was set) or null when the entity
 * doesn't exist / isn't the user's.
 */
export async function applyProjectProfile(
  userId: string,
  entityId: string,
  profile: ExtractedProfile,
): Promise<Partial<Record<keyof ExtractedProfile, string>> | null> {
  const applied: Partial<Record<keyof ExtractedProfile, string>> = {};

  if (profile.description) {
    const updated = await patchProject(userId, entityId, { description: profile.description });
    if (!updated) return null;
    applied.description = profile.description;
  }

  const attrKeys = [
    "mission", "vision", "customers", "stack", "status", "next_step",
    "architecture", "conventions", "definition_of_done",
    "problem", "solution", "current_alternatives", "competitors",
    "complements_substitutes", "partnerships", "potential_customers", "expansion_ideas",
  ] as const;

  const entries = attrKeys.flatMap((key) => {
    const value = profile[key];
    return value ? ([[key, value] as const]) : [];
  });

  if (entries.length > 0) {
    // One owner check + one transaction — avoids 17 round trips over a remote DB
    // (the enrich-prod-profiles script was hitting ETIMEDOUT mid-apply).
    const [owner] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.id, entityId), eq(entities.userId, userId)));
    if (!owner) return null;

    await db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        const normalized = key.toLowerCase().replace(/\s+/g, "_");
        await tx
          .insert(attributes)
          .values({
            userId,
            entityId,
            key: normalized,
            value,
            source: SOURCE_FLEETCROWN_UI,
          })
          .onConflictDoUpdate({
            target: [attributes.userId, attributes.entityId, attributes.key],
            set: { value, updatedAt: new Date() },
          });
        applied[key] = value;
      }
    });
  }

  scheduleProjectProfileReindexByEntityId(userId, entityId);
  return applied;
}
