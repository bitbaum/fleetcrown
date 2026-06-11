"use client";

import { Zap } from "lucide-react";
import { AUTO_INJECT_MODES, type AutoInjectMode } from "@/config/beacon";
import { cn } from "@/lib/utils";

/**
 * Per-mode visual state. After the 2026-06-11 collapse autopilot is binary:
 * gray dot (off) or pulsing accent dot (on). Color + tooltip make the
 * dispatch behavior unmistakable at a glance — the user can tell from the
 * /control top bar whether the next status:ready is going to fire something
 * or sit idle.
 */
const MODE_STYLE: Record<AutoInjectMode, { dotClass: string; tooltip: string; pulse: boolean }> = {
  off: {
    dotClass: "bg-text-tertiary",
    tooltip: "Autopilot off — FleetCrown dispatches nothing. You type every prompt in /control and click Send.",
    pulse: false,
  },
  on: {
    dotClass: "bg-accent-primary",
    tooltip: "Autopilot on — when an agent finishes, FleetCrown fires the queue head (or the canned next_best template if the queue is empty). Status:working, blockers, and health gates still apply.",
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
