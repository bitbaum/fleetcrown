"use client";

import { useEffect, useState } from "react";
import type { PollerState, PollerStatus, FleetRunnerBridge } from "./types";

/**
 * Renders a small connection chip in the app top bar — but only when the
 * React tree is loaded inside the Fleet Runner desktop shell. Inside a normal
 * browser tab `window.fleetRunner` is undefined and this component returns
 * null, so the same React build serves both surfaces.
 *
 * The pill subscribes to `onPollerStatus`, so it reflects the live main-process
 * poller without polling IPC on a timer. The title attribute carries the
 * detail (token prefix, base URL, last poll, error) for users who want to
 * verify the wiring without digging into a settings panel.
 */

const STATE_LABEL: Record<PollerState, string> = {
  idle: "Fleet Runner · idle",
  connecting: "Fleet Runner · connecting…",
  connected: "Fleet Runner · live",
  error: "Fleet Runner · error",
};

const STATE_DOT: Record<PollerState, string> = {
  idle: "ui-dot-warning",
  connecting: "ui-dot-warning",
  connected: "ui-dot-positive",
  error: "ui-dot-negative",
};

function formatTooltip(s: PollerStatus): string {
  const lines: string[] = [STATE_LABEL[s.state]];
  if (s.baseUrl) lines.push(`Control plane: ${s.baseUrl}`);
  if (s.tokenPrefix) lines.push(`Token: ${s.tokenPrefix}`);
  if (s.lastPollAt) {
    const ago = Math.max(0, Math.floor((Date.now() - s.lastPollAt) / 1000));
    lines.push(`Last poll: ${ago}s ago`);
  }
  if (s.commandsHandled > 0) lines.push(`Ran: ${s.commandsHandled}`);
  if (s.commandsRejected > 0) lines.push(`Rejected: ${s.commandsRejected}`);
  if (s.lastError) lines.push(`Error: ${s.lastError}`);
  return lines.join("\n");
}

function isBridgeReady(
  b: Window["fleetRunner"],
): b is FleetRunnerBridge & Pick<FleetRunnerBridge, "getPollerStatus" | "onPollerStatus"> {
  return typeof b?.getPollerStatus === "function" && typeof b?.onPollerStatus === "function";
}

export function FleetRunnerStatusPill() {
  const [status, setStatus] = useState<PollerStatus | null>(null);

  useEffect(() => {
    const bridge = window.fleetRunner;
    if (!isBridgeReady(bridge)) return;

    let cancelled = false;
    bridge.getPollerStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { /* leave null → component renders nothing */ });

    const unsubscribe = bridge.onPollerStatus((next) => {
      if (!cancelled) setStatus(next);
    });

    return () => {
      cancelled = true;
      try { unsubscribe?.(); } catch { /* listener already torn down */ }
    };
  }, []);

  if (!status) return null;

  const shortLabel =
    status.state === "connected" ? "live"
    : status.state === "connecting" ? "connecting"
    : status.state === "error" ? "error"
    : "idle";

  return (
    <span
      className="ui-tag ui-tag-neutral"
      title={formatTooltip(status)}
      aria-label={STATE_LABEL[status.state]}
    >
      <span className={`ui-dot ${STATE_DOT[status.state]}`} aria-hidden="true" />
      <span>Runner · {shortLabel}</span>
    </span>
  );
}
