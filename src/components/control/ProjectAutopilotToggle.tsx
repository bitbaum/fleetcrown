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

import { useEffect, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { patchJson } from "@/lib/api/fetch";
import { FLEETCROWN_REFRESH_EVENT } from "@/lib/client-events";
import { AUTO_INJECT_MODES, type AutoInjectMode } from "@/config/beacon";

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
  const effectiveMeta = AUTO_INJECT_MODES.find((mode) => mode.value === effectiveMode);
  const inheritedMeta = AUTO_INJECT_MODES.find((mode) => mode.value === inheritedMode);
  const overridden = localOverride !== null;

  async function saveOverride(nextRaw: string) {
    setSaving(true);
    setError(null);
    const nextOverride = nextRaw === "inherit" ? null : nextRaw as AutoInjectMode;
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

  const tooltip = overridden
    ? `Project override: ${effectiveMeta?.label ?? effectiveMode}. Global mode is ${inheritedMeta?.label ?? inheritedMode}.`
    : `Inherits global autopilot mode: ${inheritedMeta?.label ?? inheritedMode}.`;

  return (
    <div className="inline-flex max-w-full flex-wrap items-center gap-2 text-xs">
      <label
        title={tooltip}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2 py-1 text-text-secondary"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : <Zap className="h-3.5 w-3.5 text-accent-text" />}
        <span className="text-text-muted">Project autopilot</span>
        <select
          value={localOverride ?? "inherit"}
          disabled={saving}
          onChange={(event) => saveOverride(event.target.value)}
          className="bg-transparent font-medium text-text-primary outline-none disabled:opacity-60"
          aria-label="Project autopilot mode"
        >
          <option value="inherit">Inherit global ({inheritedMeta?.label ?? inheritedMode})</option>
          {AUTO_INJECT_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>{mode.label}</option>
          ))}
        </select>
      </label>
      {overridden && (
        <span className="text-micro text-accent-text" title="This project no longer follows the global autopilot selector.">
          override
        </span>
      )}
      {error && <span className="text-xs text-status-warning">{error}</span>}
    </div>
  );
}
