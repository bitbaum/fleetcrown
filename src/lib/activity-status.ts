// Pure domain helpers for activity status — no DB or React dependencies.
// Importable from tests, from API routes, and from UI without pulling in
// the Postgres pool.
//
// Anything that classifies a run, ranks its severity, or picks a display
// body for a prompt lives here. If you find yourself replicating one of
// these rules anywhere, import from here instead.

import { getIntentLabel } from "@/config/control-intents";

export type EventStatus = "negative" | "warning" | "positive" | "neutral";

type RunStatusInput = {
  state: string | null;
  outcome: string | null;
  payload: { error?: unknown } | null;
  finishedAt: Date | null;
};

export function isErrorRun(run: RunStatusInput): boolean {
  return run.outcome === "error" || run.state === "error" || Boolean(run.payload?.error);
}

export function runStatus(run: RunStatusInput): EventStatus {
  if (isErrorRun(run)) return "negative";
  if (run.state === "running" && !run.finishedAt) return "warning";
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

// The most informative body for a prompt row. Custom text (what the user
// typed) wins; then the rendered intent template (populated for dispatches
// from 2026-06-10 onward); then the intent label so legacy rows still
// render something. Harness scaffolding is stripped so titles stay human;
// if stripping a value leaves nothing, fall through to the next source.
// Used by every surface that displays a prompt.
export function promptDisplayBody(row: PromptBodyInput): string {
  const custom = row.customPrompt ? stripHarnessScaffolding(row.customPrompt) : "";
  if (custom) return custom;
  const resolved = row.resolvedPrompt ? stripHarnessScaffolding(row.resolvedPrompt) : "";
  if (resolved) return resolved;
  return getIntentLabel(row.intent);
}

export function toPromptDisplayFields(row: PromptBodyInput): PromptDisplayFields {
  const customPrompt = row.customPrompt?.trim() ? row.customPrompt : null;
  const resolvedPrompt = row.resolvedPrompt?.trim() ? row.resolvedPrompt : null;
  return {
    customPrompt,
    resolvedPrompt,
    displayText: promptDisplayBody({ customPrompt, resolvedPrompt, intent: row.intent }),
    isCustom: Boolean(customPrompt),
  };
}

// Severity ordering for "worst of N events" reductions (status strip etc).
export const STATUS_RANK: Record<EventStatus, number> = {
  negative: 3,
  warning: 2,
  positive: 1,
  neutral: 0,
};
