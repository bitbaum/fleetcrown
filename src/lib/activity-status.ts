// Pure domain helpers for activity status — no DB or React dependencies.
// Importable from tests, from API routes, and from UI without pulling in
// the Postgres pool.
//
// Anything that classifies a run, ranks its severity, or picks a display
// body for a prompt lives here. If you find yourself replicating one of
// these rules anywhere, import from here instead.

import { getIntentLabel } from "@/config/control-intents";
import type { StatusTone } from "@/lib/constants/statuses";
import { ORCH_STATE } from "@/lib/orchestration/contract";

type RunStatusInput = {
  state: string | null;
  outcome: string | null;
  payload: { error?: unknown } | null;
  finishedAt: Date | null;
};

export function isErrorRun(run: RunStatusInput): boolean {
  return run.outcome === "error" || run.state === ORCH_STATE.ERROR || Boolean(run.payload?.error);
}

export function runStatus(run: RunStatusInput): StatusTone {
  if (isErrorRun(run)) return "negative";
  if (run.state === ORCH_STATE.RUNNING && !run.finishedAt) return "warning";
  if (run.outcome === "success") return "positive";
  if (run.outcome === "partial") return "warning";
  return "neutral";
}

type PromptBodyInput = {
  customPrompt: string | null;
  resolvedPrompt: string | null;
  intent: string;
};

export type PromptDisplayFields = {
  customPrompt: string | null;
  resolvedPrompt: string | null;
  displayText: string;
  isCustom: boolean;
};

// Strip harness scaffolding so an activity title shows the human intent, not the
// raw injected machine prompt. Dispatches can capture the fully-assembled prompt
// (context tiers + harness envelopes), which renders as noise like
// "<task-notification><task-id>…" in every activity feed. Only rewrites when a
// harness tag is actually present — clean prompts (and their whitespace) pass
// through verbatim, so existing display semantics are preserved.
const HARNESS_TAG = /<\/?(task-notification|system-reminder|command-[a-z-]+|local-command-[a-z-]+)[^>]*>/i;
export function stripHarnessScaffolding(text: string): string {
  if (!HARNESS_TAG.test(text)) return text;
  return text
    // Drop whole paired blocks first (content between open/close tags).
    .replace(/<(task-notification|system-reminder|command-[a-z-]+|local-command-[a-z-]+)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    // Then any stray/self-closing harness tags left behind.
    .replace(HARNESS_TAG, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The fully-assembled operator dispatch (preamble + engineering standards +
// autopilot ruleset + exit contract, ~2,000 words) is machine plumbing, not a
// human changelog entry. When a stored prompt IS that envelope, rendering it
// verbatim buried the Activity timeline under three full copies of the
// pipeline's guts. Detect it and collapse to the intent label instead.
const OPERATOR_ENVELOPE = /#\s*FleetCrown operator dispatch/i;
export function isOperatorEnvelope(text: string): boolean {
  return OPERATOR_ENVELOPE.test(text.slice(0, 200));
}

// The most informative body for a prompt row. Custom text (what the user
// typed) wins; then the rendered intent template (populated for dispatches
// from 2026-06-10 onward); then the intent label so legacy rows still
// render something. Harness scaffolding is stripped so titles stay human;
// if stripping a value leaves nothing, fall through to the next source.
// Used by every surface that displays a prompt.
export function promptDisplayBody(row: PromptBodyInput): string {
  const custom = row.customPrompt ? stripHarnessScaffolding(row.customPrompt) : "";
  if (custom && !isOperatorEnvelope(custom)) return custom;
  const resolved = row.resolvedPrompt ? stripHarnessScaffolding(row.resolvedPrompt) : "";
  if (resolved && !isOperatorEnvelope(resolved)) return resolved;
  const label = getIntentLabel(row.intent);
  // Tag "assembled operator dispatch" ONLY when we actually hid an operator
  // envelope. A legacy row with no prompt text just shows the intent label —
  // it must not claim a ~2,000-word dispatch was hidden when there was none.
  return isOperatorEnvelope(custom) || isOperatorEnvelope(resolved)
    ? `${label} — assembled operator dispatch (brief + goals + autopilot rules; full text hidden)`
    : label;
}

// Strip the harness envelope and collapse to null when nothing human remains.
// Used so the display fields below are display-safe by construction. Mirrors
// stripHarnessScaffolding's own contract: a clean value (no harness tag) passes
// through VERBATIM — surrounding whitespace included — so existing display
// semantics are preserved; only a value that actually carried scaffolding gets
// the strip's whitespace-collapse. Whitespace-only or scaffolding-only → null.
function nonEmptyStripped(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  const stripped = stripHarnessScaffolding(text);
  if (!stripped.trim()) return null;
  // Operator envelopes are machine plumbing — treat like scaffolding-only so
  // surfaces that render these fields directly never leak the full dispatch.
  return isOperatorEnvelope(stripped) ? null : stripped;
}

export function toPromptDisplayFields(row: PromptBodyInput): PromptDisplayFields {
  // Display contract: customPrompt/resolvedPrompt are harness-envelope-free, so
  // every surface that renders them directly (Recent Agent Work, history feed)
  // is display-safe without re-stripping. A dispatch that is pure scaffolding —
  // e.g. a <task-notification> completion signal mis-recorded as a custom
  // prompt — strips to empty → null, so isCustom is false and the row falls back
  // to its intent label instead of leaking the raw machine envelope.
  const customPrompt = nonEmptyStripped(row.customPrompt);
  const resolvedPrompt = nonEmptyStripped(row.resolvedPrompt);
  return {
    customPrompt,
    resolvedPrompt,
    displayText: promptDisplayBody({ customPrompt, resolvedPrompt, intent: row.intent }),
    isCustom: Boolean(customPrompt),
  };
}

// Severity ordering for "worst of N events" reductions (status strip etc).
export const STATUS_RANK: Record<StatusTone, number> = {
  negative: 3,
  warning: 2,
  positive: 1,
  neutral: 0,
};
