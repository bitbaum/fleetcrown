// Ranking + editorial layer for the frontier digest.
//
// Takes the deduped candidate pool from ingest.ts and asks Groq to act as the
// digest's editor: pick the most significant items, write a one-line "why it
// matters" for each, plus a headline and short intro. The model only returns
// *indices* into the candidate array — titles/URLs are taken from the real
// candidates, so a link can never be hallucinated. Falls back to a
// deterministic top-N (by score) if the model errors or returns junk.

import { callGroqText, GROQ_FAST_MODEL } from "@/lib/groq";
import type { FrontierCandidate } from "./ingest";
import type { FrontierItem } from "./types";

const MAX_CANDIDATES = 26; // cap what we send the model
const TARGET_PICKS = 8;

const SYSTEM_PROMPT = `You are the editor of FleetCrown's daily frontier digest: the latest and most significant developments in AI, robotics, and adjacent frontier technology, written for a technical audience of builders.

From the numbered candidate items you are given, select the ${TARGET_PICKS} MOST significant and genuinely newsworthy. Prefer substantive research results, real capability breakthroughs, major model/product releases, and robotics milestones. Demote incremental papers, promotional posts, opinion pieces, and anything not actually about frontier technology.

For each pick, write ONE sharp sentence on why it matters — concrete, no hype, no emojis. Also write a one-line "headline" naming the day's dominant theme, and a 2-sentence "intro".

Return STRICT JSON only, no prose around it, in exactly this shape:
{"headline":"...","intro":"...","picks":[{"index":<number>,"summary":"..."}]}
Use only indices that appear in the candidate list. Do not invent items.`;

export type FrontierDigestResult = {
  headline: string;
  intro: string;
  items: FrontierItem[];
  model: string;
};

function candidateToItem(c: FrontierCandidate, summary: string): FrontierItem {
  return { title: c.title, url: c.url, source: c.source, category: c.category, summary };
}

function fallback(candidates: FrontierCandidate[]): FrontierDigestResult {
  const items = candidates.slice(0, TARGET_PICKS).map((c) =>
    candidateToItem(c, c.excerpt ? c.excerpt.slice(0, 160) : "Notable development on the AI / robotics frontier."),
  );
  return {
    headline: "Today on the AI & robotics frontier",
    intro: "The latest research and releases our sources surfaced today. Ranking was unavailable, so these are the highest-signal items by source score.",
    items,
    model: "fallback",
  };
}

function buildUserPrompt(candidates: FrontierCandidate[]): string {
  const lines = candidates.map(
    (c, i) => `[${i}] (${c.source}) ${c.title}${c.excerpt ? ` — ${c.excerpt.slice(0, 200)}` : ""}`,
  );
  return `Candidate items:\n${lines.join("\n")}`;
}

// Pull the first balanced {...} object out of a model response that may be
// fenced or have stray prose around it.
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

export async function generateFrontierDigest(
  allCandidates: FrontierCandidate[],
): Promise<FrontierDigestResult> {
  const candidates = allCandidates.slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) {
    return { headline: "No frontier items today", intro: "Sources returned nothing new in the window.", items: [], model: "static" };
  }

  let raw: string;
  try {
    raw = await callGroqText(buildUserPrompt(candidates), {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 1100,
      temperature: 0.3,
      timeoutMs: 22_000,
    });
  } catch {
    return fallback(candidates);
  }

  const json = extractJson(raw);
  if (!json) return fallback(candidates);

  let parsed: { headline?: unknown; intro?: unknown; picks?: unknown };
  try {
    parsed = JSON.parse(json);
  } catch {
    return fallback(candidates);
  }

  const picks = Array.isArray(parsed.picks) ? parsed.picks : [];
  const seen = new Set<number>();
  const items: FrontierItem[] = [];
  for (const p of picks) {
    const idx = typeof p === "object" && p && "index" in p ? Number((p as { index: unknown }).index) : NaN;
    const summary = typeof p === "object" && p && "summary" in p ? String((p as { summary: unknown }).summary) : "";
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length || seen.has(idx)) continue;
    seen.add(idx);
    items.push(candidateToItem(candidates[idx], summary.trim() || candidates[idx].excerpt.slice(0, 160)));
    if (items.length >= TARGET_PICKS) break;
  }

  if (items.length === 0) return fallback(candidates);

  const headline = typeof parsed.headline === "string" && parsed.headline.trim()
    ? parsed.headline.trim()
    : "Today on the AI & robotics frontier";
  const intro = typeof parsed.intro === "string" && parsed.intro.trim()
    ? parsed.intro.trim()
    : "The most significant AI and robotics developments our sources surfaced today.";

  return { headline, intro, items, model: GROQ_FAST_MODEL };
}
