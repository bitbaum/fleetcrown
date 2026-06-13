"use client";

import { Loader2, Pause, Play } from "lucide-react";
import type { AutoInjectMode } from "@/config/beacon";
import { cn } from "@/lib/utils";

/**
 * Fleet-wide play/pause. One button, media-player semantics: it shows the
 * action a click will take. Paused fleet → accent "Build all" (play icon);
 * building fleet → quiet "Pause all" with a pulsing dot as the live
 * "development is happening" signal that the working counters below
 * corroborate. Replaces the off/on <select> from the 2026-06-11 collapse —
 * a binary mode deserves a single button, not a dropdown.
 */
const MODE_TOOLTIP: Record<AutoInjectMode, string> = {
  off: "Fleet paused — FleetCrown dispatches nothing. Click to start building: agents work through each project's queue, then pick the next-best task automatically. Busy agents, blockers, and failing health checks still pause dispatch.",
  on: "Fleet building — when an agent finishes, FleetCrown sends the next queued instruction (or picks the next-best task if the queue is empty). Click to pause all dispatching.",
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
  const building = mode === "on";
  return (
    <button
      type="button"
      aria-pressed={building}
      title={MODE_TOOLTIP[mode]}
      disabled={saving}
      onClick={() => onChange(building ? "off" : "on")}
      className={cn(building ? "ui-btn-secondary" : "ui-btn-primary", "gap-1.5 px-3 py-1.5 text-xs")}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : building ? (
        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {building && (
        <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-primary" />
      )}
      {building ? "Pause all" : "Build all"}
    </button>
  );
}
