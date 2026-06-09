"use client";

import { Zap } from "lucide-react";
import { AUTO_INJECT_MODES, type AutoInjectMode } from "@/config/beacon";
import { cn } from "@/lib/utils";

/**
 * Per-mode visual state. Color + tooltip make the dispatch behavior
 * unmistakable at a glance — the root frustration the user surfaced
 * 2026-05-31 ("what are these random injections / this is dysfunctional")
 * was that the autopilot's current mode wasn't visible enough to know what
 * a click anywhere on /control was going to do next.
 *
 *   off         → gray dot   · "Manual — you dispatch every prompt"
 *   queue_only  → amber dot  · "Queue — drain your written list, stop when empty"
 *   beacon      → cyan dot, animated · "Beacon — popup + countdown auto-pick"
 *   next_best   → blue dot, animated · "Continuous — auto-fires next-best, no popup"
 *   strategist  → green dot, animated · "Mission — Groq composes from full context"
 */
const MODE_STYLE: Record<AutoInjectMode, { dotClass: string; tooltip: string; pulse: boolean }> = {
  off: {
    dotClass: "bg-text-tertiary",
    tooltip: "Manual (L1) — FleetCrown dispatches nothing. You type every prompt in /control and click Send. Total control; zero surprises.",
    pulse: false,
  },
  queue_only: {
    dotClass: "bg-status-warning",
    tooltip: "Queue (L2) — when the agent finishes, FleetCrown fires the next item from YOUR queue. Stops when queue is empty. Your plan, executed in order.",
    pulse: false,
  },
  beacon: {
    dotClass: "bg-accent-text",
    tooltip: "Beacon (L3) — prepares the next action and shows a handoff popup. If you are away, the countdown can auto-submit that prepared action.",
    pulse: true,
  },
  next_best: {
    dotClass: "bg-accent-primary",
    tooltip: "Continuous (L4) — drains your queue, then sends the canned next-best recovery/progress template without a popup.",
    pulse: true,
  },
  strategist: {
    dotClass: "bg-status-positive",
    tooltip: "Mission (L5) — composes from handoff, queue, mission, recent commits, and outcomes, then dispatches without asking.",
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
        {AUTO_INJECT_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
