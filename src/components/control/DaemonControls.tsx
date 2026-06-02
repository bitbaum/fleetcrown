"use client";

/**
 * One-click daemon lifecycle controls for the local install (RUNTIME_AVAILABLE=true).
 * Solves the recurring "daemon offline, no UI to recover" complaint surfaced
 * 2026-05-31: until now the only way to start the helper after a crash/sleep
 * was a terminal command, which broke the "fleet control" value prop.
 *
 * Cloud users see a disabled tooltip — there's no remote daemon to control.
 */
import { useState } from "react";
import { Play, RotateCw, Square, Loader2, Check, AlertTriangle } from "lucide-react";
import { postJson } from "@/lib/api/fetch";

type DaemonState = "active" | "inactive" | "failed" | "unknown";

export function DaemonControls({
  runtimeAvailable,
  currentState,
  onAfter,
}: {
  /** True on local installs only — cloud renders disabled buttons. */
  runtimeAvailable: boolean;
  /** Pre-fetched state to label the primary action correctly (Start vs Restart). */
  currentState: DaemonState;
  /** Caller refreshes its view after an action lands. */
  onAfter?: () => void;
}) {
  const [busy, setBusy] = useState<null | "start" | "restart" | "stop">(null);
  const [outcome, setOutcome] = useState<null | { kind: "ok"; state: DaemonState; action: string } | { kind: "error"; message: string }>(null);

  const act = async (action: "start" | "restart" | "stop") => {
    setBusy(action);
    setOutcome(null);
    try {
      const res = await postJson("/api/system/daemon", { action });
      const json = await res.json() as { ok?: boolean; state?: DaemonState; error?: string };
      if (json.ok && json.state) {
        setOutcome({ kind: "ok", state: json.state, action });
        onAfter?.();
      } else {
        setOutcome({ kind: "error", message: json.error ?? `${action} failed` });
      }
    } catch (e) {
      setOutcome({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const cloudTooltip = "Daemon control runs on your local install only — the cloud has no helper process to start.";
  const disabled = !runtimeAvailable;
  const startLabel = currentState === "active" ? "Running" : "Start daemon";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => act("start")}
        disabled={disabled || busy !== null || currentState === "active"}
        title={disabled ? cloudTooltip : "Start the local daemon (systemctl --user start fleetcrown-daemon or equivalent)"}
        className="ui-btn-secondary ui-btn-xs inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        {busy === "start" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        {currentState === "active" ? "Running" : startLabel}
      </button>

      <button
        type="button"
        onClick={() => act("restart")}
        disabled={disabled || busy !== null}
        title={disabled ? cloudTooltip : "Restart the local daemon (useful after editing daemon.env)"}
        className="ui-btn-secondary ui-btn-xs inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        {busy === "restart" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
        Restart
      </button>

      <button
        type="button"
        onClick={() => act("stop")}
        disabled={disabled || busy !== null || currentState !== "active"}
        title={disabled ? cloudTooltip : "Stop the local daemon — autopilot won't fire until restarted"}
        className="ui-btn-ghost ui-btn-xs inline-flex items-center gap-1.5 text-text-muted disabled:opacity-40"
      >
        {busy === "stop" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
        Stop
      </button>

      {outcome?.kind === "ok" && (
        <span className="inline-flex items-center gap-1 text-micro text-status-positive">
          <Check className="h-3 w-3" /> {outcome.action} → {outcome.state}
        </span>
      )}
      {outcome?.kind === "error" && (
        <span className="inline-flex items-center gap-1 text-micro text-status-negative" title={outcome.message}>
          <AlertTriangle className="h-3 w-3" /> failed
        </span>
      )}
    </div>
  );
}
