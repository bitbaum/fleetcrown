import { z } from "zod";
import { callGroqText } from "@/lib/groq";
import { patchProject } from "@/db/queries/projects";
import { upsertEntityAttribute } from "@/db/queries/utils";

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
Omit any key the source text gives no basis for. NEVER invent facts that are not in the text. Write in the same language as the source text uses for prose (default English).`;

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

  const attrKeys = ["mission", "vision", "customers", "stack", "status", "next_step"] as const;
  for (const key of attrKeys) {
    const value = profile[key];
    if (!value) continue;
    const ok = await upsertEntityAttribute(userId, entityId, key, value);
    if (!ok) return null;
    applied[key] = value;
  }

  return applied;
}
