"use client";

import { Zap } from "lucide-react";
import type { AutoInjectMode } from "@/config/beacon";

const MODES: { value: AutoInjectMode; label: string }[] = [
  { value: "off", label: "Manual" },
  { value: "queue_only", label: "Continue queued work" },
  { value: "strategist", label: "Autonomous" },
  { value: "next_best", label: "Canned next-best" },
];

export function AutomationPolicyControl({
  mode,
  saving,
  onChange,
}: {
  mode: AutoInjectMode;
  saving: boolean;
  onChange: (mode: AutoInjectMode) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-xs text-text-secondary">
      <Zap className="h-3.5 w-3.5 text-accent-text" />
      <span className="hidden sm:inline">Automation</span>
      <select
        aria-label="Automation policy"
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
