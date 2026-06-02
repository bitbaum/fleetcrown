"use client";

import { useEffect, useState } from "react";
import { X, Radio, WifiOff } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { APP_NAME } from "@/config/brand";
import { getJson } from "@/lib/api/fetch";
import { DaemonControls } from "./DaemonControls";

type DaemonState = "active" | "inactive" | "failed" | "unknown";

type Props = {
  daemonNeverSeen: boolean;
  daemonOffline: boolean;
  daemonLastPushedAt: string | null;
  /** True on local installs only. Cloud renders DaemonControls disabled. */
  runtimeAvailable?: boolean;
  /** Caller refreshes its data view after the daemon lifecycle changes. */
  onRefresh?: () => void;
};

export function DaemonStatusBanner({
  daemonNeverSeen,
  daemonOffline,
  daemonLastPushedAt,
  runtimeAvailable = false,
  onRefresh,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [unitState, setUnitState] = useState<DaemonState>("unknown");

  // Probe systemd unit state on mount + after every successful control
  // action. Decoupled from daemonOffline (which is "is the daemon pushing
  // updates?") so the button labels reflect whether the unit is loaded but
  // not pushing vs truly stopped. Local-only — cloud 403s the GET.
  useEffect(() => {
    if (!runtimeAvailable) return;
    getJson<{ state: DaemonState }>("/api/system/daemon")
      .then((r) => setUnitState(r.state))
      .catch(() => setUnitState("unknown"));
  }, [runtimeAvailable]);

  if (dismissed || (!daemonNeverSeen && !daemonOffline)) return null;

  const lastSeen = daemonLastPushedAt
    ? timeAgo(new Date(daemonLastPushedAt).getTime())
    : null;

  const refreshAfterAction = () => {
    getJson<{ state: DaemonState }>("/api/system/daemon")
      .then((r) => setUnitState(r.state))
      .catch(() => {});
    onRefresh?.();
  };

  return (
    <div className="ui-callout-warning">
      <div className="mt-0.5 shrink-0 text-status-warning">
        {daemonNeverSeen ? (
          <Radio className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <span className="font-medium text-text-primary">
            {daemonNeverSeen ? `Finish setup to dispatch agents` : "Local daemon offline"}
          </span>
          {!daemonNeverSeen && lastSeen && (
            <span className="ml-2 text-xs text-text-tertiary">last seen {lastSeen}</span>
          )}
        </div>

        {daemonNeverSeen ? (
          <>
            <p className="text-text-secondary leading-relaxed">
              Welcome! {APP_NAME} lets you control AI agents (Grok, Claude, Cursor, etc.) that run on <strong>your own computer</strong> from this website.
            </p>
            <p className="text-sm text-text-secondary">
              A one-time setup is needed so the website can talk to your agents safely. We’re making this as easy as possible.
            </p>
            <div className="space-y-2 text-sm text-text-secondary">
              <div>1. Install <a href="https://zellij.dev/" target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-2 hover:underline">Zellij</a> (quick terminal tool).</div>
              <div>2. Pick an agent CLI (Grok is great for new users) and install it with one command.</div>
              <div>3. Generate a token below and run the one-line installer. Done.</div>
            </div>
            <p className="text-xs text-text-muted mt-2">
              Once the helper is running (ideally as a background service — run the installer in scripts/install-daemon.sh), these buttons will open a fresh terminal tab with the exact installer already running. After that, the website becomes the magic control plane for all your agents.
            </p>
          </>
        ) : (
          <>
            <p className="text-text-secondary leading-relaxed">
              The helper on your computer stopped sending updates. All agent commands are safely queued until it reconnects.
            </p>
            <DaemonControls
              runtimeAvailable={runtimeAvailable}
              currentState={unitState}
              onAfter={refreshAfterAction}
            />
            {!runtimeAvailable && (
              <p className="text-xs text-text-muted">
                You&apos;re on the cloud install — daemon control runs only from your local machine. Open {APP_NAME} at <code className="rounded bg-surface-overlay px-1">http://localhost:3000</code> to start/restart the helper.
              </p>
            )}
          </>
        )}

        {/* One-click agent CLI install — the vision the user asked for.
            Suppressed when the daemon is offline on a cloud install: the
            buttons POST to /api/agent/install-cli, which queues an installer
            command for the daemon to pick up. With the daemon down and no
            local daemon reachable from cloud, the buttons silently no-op and
            their helper text ("When your Local Agent Helper is running…")
            directly contradicts the banner just above. Keep them visible in
            the never-seen (setup) flow and when running locally. */}
        {(daemonNeverSeen || runtimeAvailable) && (
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-xs text-text-muted mb-1.5">Missing an agent CLI? Click to open a dedicated terminal tab with the installer:</p>
            <div className="flex flex-wrap gap-2">
              {["grok", "claude", "cursor", "gemini", "codex"].map((a) => (
                <button
                  key={a}
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/agent/install-cli", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ agent: a }),
                      });
                      if (res.ok) {
                        // Success — daemon will open the tab if connected
                      }
                    } catch {}
                  }}
                  className="ui-btn-secondary ui-btn-xs"
                >
                  Install {a[0].toUpperCase() + a.slice(1)}
                </button>
              ))}
            </div>
            <p className="text-micro text-text-muted mt-1">
              When your Local Agent Helper is running, these buttons open a dedicated “Install X” tab with the installer already pasted.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text-primary"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
