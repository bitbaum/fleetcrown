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

// The most informative body for a prompt row. Custom text (what the user
// typed) wins; then the rendered intent template (populated for dispatches
// from 2026-06-10 onward); then the intent label so legacy rows still
// render something. Used by every surface that displays a prompt.
export function promptDisplayBody(row: PromptBodyInput): string {
  return row.customPrompt || row.resolvedPrompt || getIntentLabel(row.intent);
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
