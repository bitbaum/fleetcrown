"use client";

// Per-project autopilot pause/resume.
//
// Pre-v0.7: a single user-level beacon_settings.auto_inject_mode applied to
// every project. Users dogfooding multi-project flows wanted a way to pause
// autopilot on one project without disabling it everywhere ("strategist
// globally is fine, but I'm in the middle of something fragile in this
// repo and the loop fires would be noise").
//
// This toggle writes/clears entities.auto_inject_mode_override:
//   - "Paused for this project" (override = "off")
//   - "Inherits global" (override = null)
//
// Full per-project mode-tier control (off/queue/beacon/continuous/mission
// per-project) is a v2 — for now the binary covers the dominant use case
// and keeps the UI scan-light. Power users can still use the global tier
// in Settings → Beacon.

import { useState } from "react";
import { Pause, Play, Loader2 } from "lucide-react";
import { patchJson } from "@/lib/api/fetch";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import type { AutoInjectMode } from "@/config/beacon";

export interface ProjectAutopilotToggleProps {
  /** Entity id (UUID) of the project. Required for the PATCH endpoint. */
  projectId: string | null;
  /** Current per-project override, or null if inheriting the user default. */
  currentOverride: AutoInjectMode | null;
  /** The user-level mode this project would inherit if no override is set.
   *  Surfaced in the tooltip so the user knows what "Inherit" means right now. */
  inheritedMode: AutoInjectMode;
  /** Called after a successful PATCH so the parent can refetch /api/control. */
  onAfter?: () => void;
}

export function ProjectAutopilotToggle({
  projectId,
  currentOverride,
  inheritedMode,
  onAfter,
}: ProjectAutopilotToggleProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Projects without a registered entity id (legacy paths-only projects
  // discovered from agent-projects.conf) can't be overridden — there's no
  // entity row to PATCH. Hide the toggle rather than render a button that
  // 404s on click.
  if (!projectId) return null;

  const isPaused = currentOverride === "off";

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      const nextOverride: AutoInjectMode | null = isPaused ? null : "off";
      const res = await patchJson(`/api/projects/${projectId}`, {
        autoInjectModeOverride: nextOverride,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      // Trigger a global refresh so /control re-fetches and every consumer
      // (this card + any downstream) picks up the new override.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(FLEETCROWN_REFRESH_EVENT));
      }
      onAfter?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const tooltip = isPaused
    ? `Autopilot paused for this project. Click to resume (will follow your global mode: ${inheritedMode}).`
    : `Autopilot active for this project (currently inheriting global mode: ${inheritedMode}). Click to pause.`;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        title={tooltip}
        aria-label={isPaused ? "Resume autopilot for this project" : "Pause autopilot for this project"}
        className="ui-btn-ghost inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
      >
        {saving
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : isPaused
            ? <Play className="h-3.5 w-3.5" />
            : <Pause className="h-3.5 w-3.5" />}
        {isPaused ? "Paused" : "Active"}
      </button>
      {error && <span className="text-xs text-status-warning">{error}</span>}
    </div>
  );
}
