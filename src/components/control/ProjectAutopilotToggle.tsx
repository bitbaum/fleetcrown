"use client";

// Per-project autopilot play/pause.
//
// Pre-v0.7: a single user-level beacon_settings.auto_inject_mode applied to
// every project. Users dogfooding multi-project flows wanted a way to pause
// autopilot on one project without disabling it everywhere ("globally on is
// fine, but I'm in the middle of something fragile in this repo and the loop
// fires would be noise").
//
// This control writes/clears entities.auto_inject_mode_override. Media-player
// semantics: the button shows the action a click will take (pause icon while
// building, play icon while paused). Clicking toggles the *effective* state;
// when the toggle would land back on the inherited global mode we clear the
// override instead of storing a redundant one, so "inherit" stays the default
// and the override count on the fleet hint only reflects real divergence.

import { useEffect, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { patchJson } from "@/lib/api/fetch";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import type { AutoInjectMode } from "@/config/beacon";

export interface ProjectAutopilotToggleProps {
  /** Entity id (UUID) of the project. Required for the PATCH endpoint. */
  projectId: string | null;
  /** Current per-project override, or null if inheriting the user default. */
  currentOverride: AutoInjectMode | null;
  /** The user-level mode this project would inherit if no override is set.
   *  Surfaced in the tooltip so the user knows what "follow global" means right now. */
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
  const [localOverride, setLocalOverride] = useState<AutoInjectMode | null>(currentOverride);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalOverride(currentOverride);
  }, [currentOverride]);

  // Projects without a registered entity id (legacy paths-only projects
  // discovered from agent-projects.conf) can't be overridden — there's no
  // entity row to PATCH. Hide the toggle rather than render a button that
  // 404s on click.
  if (!projectId) return null;

  const effectiveMode = localOverride ?? inheritedMode;
  const building = effectiveMode === "on";
  const overridden = localOverride !== null;

  async function saveOverride(nextOverride: AutoInjectMode | null) {
    setSaving(true);
    setError(null);
    const previous = localOverride;
    setLocalOverride(nextOverride);
    try {
      const res = await patchJson(`/api/projects/${projectId}`, {
        autoInjectModeOverride: nextOverride,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        setLocalOverride(previous);
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
      setLocalOverride(previous);
    } finally {
      setSaving(false);
    }
  }

  function toggle() {
    const target: AutoInjectMode = building ? "off" : "on";
    saveOverride(target === inheritedMode ? null : target);
  }

  // "Auto" / "Paused" describe the autopilot POLICY, not live work — the
  // pulsing accent dot used to fire here on every autopilot-on project (the
  // default), making idle projects with no agent look like they were actively
  // building. The pulse now belongs solely to the genuine `working` state
  // badge; this control is a static policy chip.
  const tooltip = building
    ? `Autopilot is on for this project${overridden ? " (project override)" : ` (following global: on)`}. It may dispatch the next task when an agent goes idle. Click to pause just this project.`
    : `Autopilot is paused for this project${overridden ? " (project override)" : ` (following global: off)`}. Click to turn it on.`;

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        aria-pressed={building}
        title={tooltip}
        disabled={saving}
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />
        ) : building ? (
          <Pause className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
        )}
        <span className="font-medium text-text-primary">{building ? "Auto" : "Paused"}</span>
      </button>
      {overridden && (
        <button
          type="button"
          disabled={saving}
          onClick={() => saveOverride(null)}
          className="text-micro text-accent-text transition-colors hover:text-text-primary disabled:opacity-60"
          title={`This project no longer follows the global play/pause. Click to follow global again (currently: ${inheritedMode}).`}
        >
          override · follow global
        </button>
      )}
      {error && <span className="text-xs text-status-warning">{error}</span>}
    </div>
  );
}
