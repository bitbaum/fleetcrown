// Definition-of-done stop-gate — the /goal pattern for autopilot.
//
// The agent writes its own handoff (status: ready), so "done" is the agent
// grading its own homework — the Ralph Wiggum failure mode. When a project
// declares a definition_of_done, we don't take the agent's word for it: a
// DIFFERENT model reads the handoff against the stated bar and decides whether
// it actually holds. If it doesn't, the run closes "partial" with the gap as
// the next instruction, and autopilot's existing continue-loop keeps going —
// i.e. don't stop until the objective condition is met.
//
// Cross-model on purpose: the worker is claude/llama; the judge here is a
// different lineage (gpt-oss), so its blind spots don't overlap the worker's.
// Fail-OPEN: if the judge errors, we let the run close as-is rather than wedge
// the loop — a missed gate is recoverable, a stuck loop is not.

import { callGroqText } from "@/lib/groq";
import { ESCALATION_HUMAN_STREAK } from "./escalation-ladder";
import type { RunClosePatch } from "./close-from-session";
import type { OrchestrationTaskSummary } from "./contract";

/**
 * The goal loop's default bound, used when a project sets no `goal_max_turns`.
 *
 * It used to be "no cap = loop until met", and NO project had ever set the
 * attribute — so every goal-mode project looped forever. That is worse than it
 * sounds: because `partial` is not a failing outcome, an endless partial streak
 * is invisible to BOTH the failure brake and the escalation ladder. datacat
 * re-closed `partial` a dozen times against the same gap ("client-side Zod
 * validation still missing") and nothing ever told a human. An unbounded goal
 * loop is indistinguishable from a stuck one, so the bound must be the default
 * rather than the opt-in.
 *
 * SSOT'd to the escalation ladder's top rung: the same number of tries
 * autopilot gets anywhere else before a human is brought in.
 */
export const DEFAULT_GOAL_MAX_TURNS = ESCALATION_HUMAN_STREAK;

/** The default cross-model judge — a different lineage from the workers
 *  (claude/llama/grok), so its blind spots don't overlap theirs. Exported so the
 *  close path can record WHO judged in the run's surfaced verdict. */
export const DOD_JUDGE_MODEL = "openai/gpt-oss-120b";
const JUDGE_MODEL = DOD_JUDGE_MODEL; // different lineage from the worker

export type DoDVerdict = { met: boolean; gap: string };

const SYSTEM = `You are an exacting reviewer deciding whether a coding agent's work meets a project's stated Definition of Done. You are NOT the agent — you do not trust its self-assessment, you check the evidence in its handoff.

A change is done ONLY if the handoff shows the Definition of Done is actually satisfied (e.g. if it says "tests pass + deploy green", the handoff must evidence both). Missing evidence = not done. Default to NOT met when the handoff is vague or silent on a required check.

Return STRICT JSON only: {"met": <true|false>, "gap": "<if not met, the single most important thing still required, one sentence; else empty>"}`;

function summaryForJudge(s: OrchestrationTaskSummary): string {
  // Only the fields that evidence completion — keep the judge prompt tight.
  const pick: Array<[keyof OrchestrationTaskSummary, string]> = [
    ["done", "What the agent says it did"],
    ["tests", "Tests"],
    ["tsc", "Typecheck"],
    ["lint", "Lint"],
    // The resulting HEAD sha (or "none"). DoDs routinely say "committed"/"shipped",
    // so the judge must SEE whether the agent actually committed — without this it
    // false-negatives a fully-evidenced handoff for "no commit evidence".
    ["commit", "Commit (resulting HEAD sha, or 'none' if no commit)"],
    ["health", "Health"],
    ["next", "Agent's stated next step"],
  ];
  return pick
    .map(([k, label]) => [label, (s as Record<string, unknown>)[k as string]])
    .filter(([, v]) => typeof v === "string" && (v as string).trim())
    .map(([label, v]) => `${label}: ${v}`)
    .join("\n");
}

function extractJson(raw: string): string | null {
  const text = (() => {
    const i = raw.lastIndexOf("</think>");
    return i === -1 ? raw : raw.slice(i + 8);
  })();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Ask a different-lineage model whether the handoff meets the DoD. Fail-open. */
export async function verifyDefinitionOfDone(
  definitionOfDone: string,
  summary: OrchestrationTaskSummary,
  opts: { model?: string } = {},
): Promise<DoDVerdict> {
  const user = `Definition of Done:\n${definitionOfDone}\n\nAgent's handoff:\n${summaryForJudge(summary)}`;
  let raw: string;
  try {
    raw = await callGroqText(user, {
      systemPrompt: SYSTEM,
      maxTokens: 400,
      temperature: 0.1,
      timeoutMs: 20_000,
      model: opts.model ?? JUDGE_MODEL,
    });
  } catch {
    return { met: true, gap: "" }; // fail-open: don't wedge the loop on a judge error
  }
  const json = extractJson(raw);
  if (!json) return { met: true, gap: "" };
  try {
    const parsed = JSON.parse(json) as { met?: unknown; gap?: unknown };
    return { met: parsed.met !== false, gap: typeof parsed.gap === "string" ? parsed.gap.trim() : "" };
  } catch {
    return { met: true, gap: "" };
  }
}

/**
 * Apply the DoD verdict to a close patch. Pure + testable.
 * Only gates a SUCCESS close: a run the agent already reported as error/partial
 * keeps its outcome. When the bar isn't met, downgrade success → partial and
 * write the gap into `next` so autopilot's continue-loop picks it up as the
 * next instruction ("don't stop until the bar holds").
 *
 * Turn cap (goal-mode): `opts.maxTurns` bounds how many times the gate will
 * re-loop a goal. `opts.priorPartials` is how many times it has ALREADY looped
 * (consecutive partial closes). Once that reaches the cap, the gate STOPS
 * downgrading — the run keeps its success outcome, so there is no gap for the
 * continue-loop to pick up and it halts. The cap is thus enforced entirely here,
 * without touching the loop. `next` records that the goal was capped, so the
 * captain sees it stopped short rather than silently. No cap (maxTurns null) =
 * unchanged behavior: loop until met.
 */
export function applyDoDGate(
  patch: RunClosePatch,
  verdict: DoDVerdict,
  opts: { priorPartials?: number; maxTurns?: number | null } = {},
): RunClosePatch {
  if (patch.outcome !== "success" || verdict.met) return patch;

  const { maxTurns, priorPartials = 0 } = opts;
  if (maxTurns != null && priorPartials >= maxTurns) {
    // Cap reached — stop looping. Keep success (no gap → loop ends), but flag it.
    return {
      ...patch,
      summary: {
        ...patch.summary,
        next: `Goal not met after ${maxTurns} attempt(s) — stopping and escalating to the captain. Last gap: ${verdict.gap || "the stated bar is not evidenced in the handoff"}.`,
      },
    };
  }

  return {
    ...patch,
    outcome: "partial",
    summary: {
      ...patch.summary,
      next: `Definition of done not yet met — ${verdict.gap || "the stated bar is not evidenced in the handoff"}. Address this, then re-verify.`,
    },
  };
}
