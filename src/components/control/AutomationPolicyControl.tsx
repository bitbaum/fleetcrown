"use client";

import { Zap } from "lucide-react";
import type { AutoInjectMode } from "@/config/beacon";
import { cn } from "@/lib/utils";

const MODES: { value: AutoInjectMode; label: string }[] = [
  { value: "off", label: "Manual" },
  { value: "queue_only", label: "Continue queued work" },
  { value: "strategist", label: "Autonomous" },
  { value: "next_best", label: "Canned next-best" },
];

/**
 * Per-mode visual state. Color + tooltip make the dispatch behavior
 * unmistakable at a glance — the root frustration the user surfaced
 * 2026-05-31 ("what are these random injections / this is dysfunctional")
 * was that the autopilot's current mode wasn't visible enough to know what
 * a click anywhere on /control was going to do next.
 *
 *   off         → gray dot   · "Autopilot off — every send is manual"
 *   queue_only  → amber dot  · "Autopilot drains your queue — never composes"
 *   next_best   → blue dot   · "Autopilot fires the canned next_best template"
 *   strategist  → green dot, animated · "Autopilot composes prompts with Groq"
 */
const MODE_STYLE: Record<AutoInjectMode, { dotClass: string; tooltip: string; pulse: boolean }> = {
  off: {
    dotClass: "bg-text-tertiary",
    tooltip: "Autopilot OFF — every send is manual. No prompts will be auto-injected into your agent.",
    pulse: false,
  },
  queue_only: {
    dotClass: "bg-status-warning",
    tooltip: "Autopilot drains your QUEUE only — never composes new prompts. Press send to fire the queue head.",
    pulse: false,
  },
  next_best: {
    dotClass: "bg-accent-primary",
    tooltip: "Autopilot fires the canned next_best template when the agent goes idle. No Groq composition.",
    pulse: true,
  },
  strategist: {
    dotClass: "bg-status-positive",
    tooltip: "Autopilot AUTONOMOUS — Groq composes context-aware prompts from your handoff + queue + commits when the agent goes idle. Set status:working in your session file to pause; raise a blocker to halt.",
    pulse: true,
  },
};

export function AutomationPolicyControl({
  mode,
  saving,
  onChange,
}: {
  mode: AutoInjectMode;
  saving: boolean;
  onChange: (mode: AutoInjectMode) => void;
}) {
  const style = MODE_STYLE[mode];
  return (
    <label
      title={style.tooltip}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-xs text-text-secondary"
    >
      <Zap className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", style.dotClass, style.pulse && "animate-pulse")}
      />
      <span className="hidden sm:inline">Autopilot</span>
      <select
        aria-label="Autopilot policy"
        value={mode}
        disabled={saving}
        onChange={(event) => onChange(event.target.value as AutoInjectMode)}
        className="bg-transparent font-medium text-text-primary outline-none disabled:opacity-60"
      >
        {MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
