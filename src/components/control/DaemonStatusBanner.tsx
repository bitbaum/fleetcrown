"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Radio, WifiOff, Sparkles, Download, Terminal, Cpu, Loader2 } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { APP_NAME } from "@/config/brand";
import { getJson, postJson } from "@/lib/api/fetch";
import "@/components/desktop/types"; // declare global window.fleetRunner

type DaemonState = "active" | "inactive" | "failed" | "unknown";

type Props = {
  daemonNeverSeen: boolean;
  daemonOffline: boolean;
  daemonLastPushedAt: string | null;
  /** True on local installs only. Cloud renders DaemonControls disabled. */
  runtimeAvailable?: boolean;
  /** When true, the user already has at least one project. Drop the
   *  "Start a new project" pitch from the never-seen variant — they
   *  already have one; they need the daemon. */
  hasProjects?: boolean;
  /** Caller refreshes its data view after the daemon lifecycle changes. */
  onRefresh?: () => void;
};

export function DaemonStatusBanner({
  daemonNeverSeen,
  daemonOffline,
  daemonLastPushedAt,
  runtimeAvailable = false,
  hasProjects = false,
  onRefresh,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  // Detect Fleet Runner so we can short-circuit the "Install Fleet Runner"
  // CTA and replace it with a one-click "Pair this app" button when the
  // user is already running inside the desktop shell.
  const [insideFleetRunner, setInsideFleetRunner] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairedTokenLabel, setPairedTokenLabel] = useState<string | null>(null);

  useEffect(() => {
    setInsideFleetRunner(typeof window !== "undefined" && !!window.fleetRunner);
  }, []);

  /** Mint a fresh agent token + hand it to the in-app Fleet Runner over IPC.
   *  One click instead of: open /settings, fill label, click "Open in Fleet
   *  Runner" deep-link. Only meaningful when running inside the desktop app. */
  async function pairInAppFleetRunner() {
    const save = window.fleetRunner?.saveToken;
    if (!save) {
      setPairError("This Fleet Runner build is missing the saveToken IPC — please update.");
      return;
    }
    setPairing(true);
    setPairError(null);
    try {
      const res = await postJson("/api/agent-tokens", {
        label: `Fleet Runner · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; token?: string; label?: string };
      if (!res.ok || !body.token) {
        setPairError(body.error ?? `Failed to mint token (HTTP ${res.status})`);
        return;
      }
      const saveRes = await save(body.token);
      if (!saveRes?.ok) {
        setPairError(saveRes?.error ?? "Token minted but Fleet Runner refused to save it");
        return;
      }
      setPairedTokenLabel(body.label ?? "Fleet Runner token");
      // Trigger a /api/onboarding re-probe so the banner can hide on next render.
      onRefresh?.();
    } catch (e) {
      setPairError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  // Progressive disclosure: the offline variant starts as a one-line status
  // chip — "offline, commands queue" is all most visits need. The full
  // recovery guidance expands on demand. The never-seen (setup) variant
  // stays expanded: that's onboarding, not noise.
  const [expanded, setExpanded] = useState(false);

  if (dismissed || (!daemonNeverSeen && !daemonOffline)) return null;

  const lastSeen = daemonLastPushedAt
    ? timeAgo(new Date(daemonLastPushedAt).getTime())
    : null;

  const refreshAfterAction = () => {
    onRefresh?.();
  };

  if (!daemonNeverSeen && !expanded) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised/60 px-3 py-2 text-xs text-text-tertiary">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-status-warning" />
        <span className="min-w-0 truncate">
          Local runtime offline{lastSeen ? ` · last seen ${lastSeen}` : ""} — commands queue until it reconnects.
        </span>
        <button
          onClick={() => setExpanded(true)}
          className="ml-auto shrink-0 text-accent hover:underline"
        >
          How to reconnect
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-primary"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

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
              {hasProjects
                ? "Install Fleet Runner to dispatch agents at your local repos."
                : `${APP_NAME} can do two things — pick whichever you need first:`}
            </p>

            <div className={`grid gap-2 ${hasProjects ? "" : "md:grid-cols-2"}`}>
              {/* Path A — "Start a new project" pitch. Hidden when the user
                  already has projects (the welcome cards on /control's empty
                  state already cover that case; users-with-projects don't
                  need to be told to start one). */}
              {!hasProjects && (
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
              )}

              {/* Path B branches on whether we're already inside Fleet Runner.
                  When yes: replace the "download" CTA with a one-click pair
                  button (the user already has the app, they just need the
                  daemon's auth glue to land). When no: keep the download
                  card so new users know to install for local dispatch. */}
              {insideFleetRunner ? (
                pairedTokenLabel ? (
                  <div className="ui-card-shell p-3 flex flex-col gap-1 border-status-positive">
                    <div className="flex items-center gap-1.5 font-medium text-status-positive text-sm">
                      <Cpu className="h-3.5 w-3.5" />
                      Paired with this Fleet Runner
                    </div>
                    <p className="text-xs text-text-muted">
                      Token <strong>{pairedTokenLabel}</strong> saved to the desktop. Daemon will appear online within ~30s.
                    </p>
                  </div>
                ) : (
                  <div className="ui-card-shell p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-medium text-text-primary text-sm">
                      <Cpu className="h-3.5 w-3.5 text-accent" />
                      Pair this Fleet Runner
                    </div>
                    <p className="text-xs text-text-muted">
                      You&apos;re already inside the desktop app. One click mints an agent token + hands it to the daemon
                      — no manual copy-paste.
                    </p>
                    <button
                      type="button"
                      onClick={pairInAppFleetRunner}
                      disabled={pairing}
                      className="ui-btn-primary self-start gap-1.5 text-xs disabled:opacity-50"
                    >
                      {pairing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Pairing…
                        </>
                      ) : (
                        <>
                          <Cpu className="h-3.5 w-3.5" />
                          Pair now
                        </>
                      )}
                    </button>
                    {pairError && (
                      <p className="text-xs text-status-warning">{pairError}</p>
                    )}
                  </div>
                )
              ) : (
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
              )}
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
                  <code>curl -fsSL https://fleetcrown.orangecat.ch/api/agent/install | node - init --token ck_xxxxxxxx</code>
                </pre>
              </div>
            </details>
          </>
        ) : (
          <>
            <p className="text-text-secondary leading-relaxed">
              The helper on your computer stopped sending updates. All agent commands are safely queued until it reconnects.
            </p>
            <div className="space-y-2 text-xs text-text-muted">
              <p>
                Launch Fleet Runner from your tray / app menu to bring it back online. Closed it by accident?{" "}
                <Link href="/download" className="text-accent underline">Re-install Fleet Runner</Link>
                {" "}or check its log for the connection error.
              </p>
              <p>
                Token expired or migrated DB?{" "}
                <Link href="/settings" className="text-accent underline">Mint a fresh ck_* token</Link>{" "}
                and re-paste it into Fleet Runner.
              </p>
            </div>
          </>
        )}

        {/* One-click agent CLI install — the vision the user asked for.
            Suppressed when the daemon is offline on a cloud install: the
            buttons POST to /api/agent/install-cli, which queues an installer
            command for the daemon to pick up. With the daemon down and no
            local daemon reachable from cloud, the buttons silently no-op and
            their helper text ("When your Local Agent Helper is running…")
            directly contradicts the banner just above. Keep them visible in
            the never-seen (setup) flow and when running locally.
            Also suppressed when inside Fleet Runner — MissingCLIsBanner
            handles that case with the same buttons but only shows the ones
            ACTUALLY missing (via the v0.6.0 getInstalledCLIs IPC), so the
            full 5-button grid here would be both noisy and redundant. */}
        {(daemonNeverSeen || runtimeAvailable) && !insideFleetRunner && (
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
