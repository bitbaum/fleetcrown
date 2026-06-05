"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Radio, WifiOff, Sparkles, Download, Terminal } from "lucide-react";
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
              {APP_NAME} can do two things — pick whichever you need first:
            </p>

            <div className="grid gap-2 md:grid-cols-2">
              {/* Path A — works TODAY, no install. */}
              <Link
                href="/control/new-from-scratch"
                className="ui-card-shell hover:border-accent transition-colors p-3 flex flex-col gap-1 group"
              >
                <div className="flex items-center gap-1.5 font-medium text-text-primary text-sm">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Start a new project
                </div>
                <p className="text-xs text-text-muted">
                  Creates a GitHub repo + project record right from this website. No install. Pick a starter (Next.js, FastAPI, Hono, plain HTML), clone wherever.
                </p>
                <span className="text-xs text-accent mt-auto pt-1 group-hover:underline">No install needed →</span>
              </Link>

              {/* Path B — agent dispatch (requires local helper). */}
              <Link
                href="/download"
                className="ui-card-shell hover:border-accent transition-colors p-3 flex flex-col gap-1 group"
              >
                <div className="flex items-center gap-1.5 font-medium text-text-primary text-sm">
                  <Download className="h-3.5 w-3.5 text-accent" />
                  Install Fleet Runner desktop
                </div>
                <p className="text-xs text-text-muted">
                  Required only if you want to <strong>dispatch agents at local repos</strong>. Detects your ~/dev folders, runs Claude/Codex/Grok/Gemini/Cursor from this website.
                </p>
                <span className="text-xs text-accent mt-auto pt-1 group-hover:underline">Download for your OS →</span>
              </Link>
            </div>

            <details className="text-xs text-text-tertiary mt-1">
              <summary className="cursor-pointer hover:text-text-secondary">
                <Terminal className="inline h-3 w-3 mr-1 -mt-0.5" />
                Prefer a terminal-only install? (CLI agent installer)
              </summary>
              <div className="mt-2 ml-4 space-y-1.5">
                <p>
                  Mint a token at{" "}
                  <Link href="/settings" className="text-accent underline">/settings → Agent tokens</Link>{" "}
                  and paste this in a terminal:
                </p>
                <pre className="ui-card-shell p-2 overflow-x-auto text-xs">
                  <code>curl -fsSL https://fleetcrown.vercel.app/api/agent/install | node - init --token ck_xxxxxxxx</code>
                </pre>
              </div>
            </details>
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
              <div className="space-y-2 text-xs text-text-muted">
                <p>
                  You&apos;re on the cloud install — daemon control runs only from your local machine.
                  Open {APP_NAME} at <code className="rounded bg-surface-overlay px-1">http://localhost:3000</code> to start/restart the helper.
                </p>
                <p>
                  Token expired or migrated DB?{" "}
                  <Link href="/settings" className="text-accent underline">Mint a fresh ck_* token</Link>{" "}
                  and re-paste it into Fleet Runner / your CLI installer.
                </p>
              </div>
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
