// The self-improvement half of the frontier loop.
//
// Given a day's digest, draft concrete proposals for how FleetCrown itself
// should evolve, then put them through an adversarial self-critique gate before
// any reach a human. The loop AUTO-PROPOSES ONLY — a human accepts (→ a roadmap
// goal) or dismisses. Decision history grounds the next run so nothing is
// re-proposed.
//
// On model-agnosticism: `critiqueProposals` takes a `model` param. Running the
// critique on the SAME model that generated (the default today) shares blind
// spots — it catches the obviously-bad but not the plausibly-wrong. Pointing
// `model` at a DIFFERENT vendor's model turns this into true cross-model
// verification (uncorrelated errors, a strictly stronger judge). That swap is
// the intended upgrade; the architecture is built for it.

import { callGroqText } from "@/lib/groq";
import type { FrontierItem } from "./types";

// Short, stable grounding so proposals stay on-target for what FleetCrown is.
const FLEETCROWN_MISSION = `FleetCrown is a multi-user SaaS platform for commanding AI agent fleets across projects: builders register projects and launch/monitor/govern vendor-agnostic AI agents (claude, cursor, codex, gemini, grok) from one control plane. It is model-agnostic, self-hosted, and its north star is captain-mode: see and govern across the agents you've deployed. A local "Fleet Runner" desktop executes dispatches; the cloud orchestrates.`;

export type DraftProposal = { title: string; rationale: string; sourceUrls: string[] };
export type ScoredProposal = DraftProposal & { score: number };

export type ProposalContext = {
  /** Titles of the owner's current active goals — do not duplicate. */
  activeGoalTitles: string[];
  /** Titles already proposed/considered (incl. dismissed) — do not repropose. */
  consideredTitles: string[];
};

function digestForPrompt(items: FrontierItem[]): string {
  return items.map((it, i) => `[${i}] (${it.category}) ${it.title} — ${it.summary} <${it.url}>`).join("\n");
}

const GENERATE_SYSTEM = `You are FleetCrown's self-improvement strategist.

${FLEETCROWN_MISSION}

Given today's frontier developments AND FleetCrown's current goals, propose AT MOST 3 specific, actionable ways FleetCrown should evolve. Each proposal MUST:
- tie a specific frontier development to a specific FleetCrown capability (not generic "use more AI");
- be concrete enough that an engineer could start building it;
- NOT duplicate an existing active goal or a previously-considered proposal.

If nothing today genuinely warrants a new direction, return an empty list. Do NOT invent work to fill the quota — an empty list is the correct answer most days.

Return STRICT JSON only:
{"proposals":[{"title":"...","rationale":"... (2-3 sentences, name the frontier item and the FleetCrown capability)","sourceUrls":["<url from the candidate list>"]}]}`;

const CRITIQUE_SYSTEM = `You are an adversarial reviewer of self-improvement proposals for FleetCrown (a model-agnostic AI-agent-fleet control plane). Default to REJECTING. A proposal only earns a high score if it is ALL of: genuinely actionable, specific to FleetCrown (not generic AI hype), tied to a real frontier development, and NOT a restatement of an existing goal.

Score each proposal 0-100. Be harsh: vague, derivative, or me-too proposals score below 50. Only proposals a thoughtful founder would actually add to the roadmap score 70+.

Return STRICT JSON only: {"scores":[{"index":<number>,"score":<0-100>}]}`;

// Pull the first balanced {...} object out of a (possibly fenced) model reply.
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

function safeParse<T>(text: string): T | null {
  const json = extractJson(text);
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Word-overlap (Jaccard) — a cheap code-level dedup net beyond the LLM's own
// instruction not to duplicate.
function tooSimilar(a: string, b: string): boolean {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return inter / union >= 0.6;
}

export async function generateProposals(
  items: FrontierItem[],
  ctx: ProposalContext,
): Promise<DraftProposal[]> {
  if (items.length === 0) return [];
  const validUrls = new Set(items.map((it) => it.url));

  const user = [
    `Today's frontier digest:\n${digestForPrompt(items)}`,
    ctx.activeGoalTitles.length ? `\nCurrent active goals (do NOT duplicate):\n- ${ctx.activeGoalTitles.join("\n- ")}` : "",
    ctx.consideredTitles.length ? `\nAlready considered (do NOT repropose):\n- ${ctx.consideredTitles.join("\n- ")}` : "",
  ].join("\n");

  let raw: string;
  try {
    raw = await callGroqText(user, { systemPrompt: GENERATE_SYSTEM, maxTokens: 1100, temperature: 0.4, timeoutMs: 22_000 });
  } catch {
    return [];
  }

  const parsed = safeParse<{ proposals?: unknown }>(raw);
  const list = Array.isArray(parsed?.proposals) ? parsed!.proposals : [];
  const drafts: DraftProposal[] = [];
  for (const p of list) {
    if (typeof p !== "object" || !p) continue;
    const title = String((p as Record<string, unknown>).title ?? "").trim();
    const rationale = String((p as Record<string, unknown>).rationale ?? "").trim();
    const urlsRaw = (p as Record<string, unknown>).sourceUrls;
    const sourceUrls = Array.isArray(urlsRaw) ? urlsRaw.map(String).filter((u) => validUrls.has(u)) : [];
    if (!title || !rationale) continue;
    // Code-level dedup against goals + already-considered + earlier drafts this run.
    if ([...ctx.activeGoalTitles, ...ctx.consideredTitles, ...drafts.map((d) => d.title)].some((t) => tooSimilar(t, title))) continue;
    drafts.push({ title, rationale, sourceUrls });
    if (drafts.length >= 3) break;
  }
  return drafts;
}

export async function critiqueProposals(
  drafts: DraftProposal[],
  opts: { model?: string } = {},
): Promise<ScoredProposal[]> {
  if (drafts.length === 0) return [];
  const user = `Proposals to review:\n${drafts.map((d, i) => `[${i}] ${d.title} — ${d.rationale}`).join("\n")}`;

  let raw: string;
  try {
    // opts.model is the swap point for cross-model verification: pass a model
    // different from the generator's and the judge becomes a different mind
    // (uncorrelated errors). Same-vendor different-model today; a future agent
    // adapter makes it fully cross-vendor.
    raw = await callGroqText(user, { systemPrompt: CRITIQUE_SYSTEM, maxTokens: 400, temperature: 0.1, timeoutMs: 20_000, model: opts.model });
  } catch {
    return []; // fail closed: no critique → nothing surfaces to the human
  }

  const parsed = safeParse<{ scores?: Array<{ index?: unknown; score?: unknown }> }>(raw);
  const scores = Array.isArray(parsed?.scores) ? parsed!.scores : [];
  const byIndex = new Map<number, number>();
  for (const s of scores) {
    const idx = Number(s?.index);
    const sc = Number(s?.score);
    if (Number.isInteger(idx) && Number.isFinite(sc)) byIndex.set(idx, Math.max(0, Math.min(100, Math.round(sc))));
  }

  return drafts.map((d, i) => ({ ...d, score: byIndex.get(i) ?? 0 }));
}

/** Minimum self-critique score for a proposal to reach a human. */
export const PROPOSAL_SCORE_THRESHOLD = 70;
