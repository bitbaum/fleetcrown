"use client";

import { useState } from "react";
import { X, Radio, WifiOff } from "lucide-react";
import Link from "next/link";
import { timeAgo } from "@/lib/dates";
import { APP_NAME, APP_SLUG, APP_URL } from "@/config/brand";

type Props = {
  daemonNeverSeen: boolean;
  daemonOffline: boolean;
  daemonLastPushedAt: string | null;
};

export function DaemonStatusBanner({ daemonNeverSeen, daemonOffline, daemonLastPushedAt }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (!daemonNeverSeen && !daemonOffline)) return null;

  const lastSeen = daemonLastPushedAt
    ? timeAgo(new Date(daemonLastPushedAt).getTime())
    : null;

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
          // First-time setup. A new web user discovers the local-runtime
          // requirement here for the first time — the docs path was
          // previously a single "start the daemon" command with no mention
          // of the three prerequisites (daemon binary, Zellij, ≥1 agent
          // CLI). Spell them out so the user can install before hitting
          // the wall on first dispatch.
          <>
            <p className="text-text-secondary leading-relaxed">
              {APP_NAME} dispatches agents from your machine. Three pieces are needed:
            </p>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-text-secondary">
              <li>
                Install <a href="https://zellij.dev/" target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-2 hover:underline">Zellij</a> — the terminal multiplexer the daemon injects prompts into.
              </li>
              <li>
                Install at least one agent CLI you want to dispatch (Claude Code, Codex, Gemini, or openclaw) and confirm it&apos;s on your <code className="text-text-tertiary">$PATH</code>.
              </li>
              <li>
                Mint a daemon token in{" "}
                <Link href="/settings#agent" className="text-accent-text underline-offset-2 hover:underline">Settings → Agent tokens</Link>
                {" "}and run:
              </li>
            </ol>
            <code className="block rounded-lg bg-surface-overlay px-3 py-2 font-mono text-xs text-text-primary break-all">
              curl -fsSL {APP_URL}/api/agent/install | node - init --base-url {APP_URL}
            </code>
            <p className="text-xs text-text-muted">
              Or: <code className="font-mono">set -a && source ~/.config/{APP_SLUG}/daemon.env && ./scripts/{APP_SLUG}-daemon.sh</code>
              {" "}· Until the daemon connects, dispatches are queued and will fire once it pings in.
            </p>
          </>
        ) : (
          // Returning user with a dropped daemon — they already have the
          // prerequisites; surface only the restart command.
          <>
            <p className="text-text-secondary leading-relaxed">
              Commands will queue until the daemon reconnects. Restart it on your local machine:
            </p>
            <code className="block rounded-lg bg-surface-overlay px-3 py-2 font-mono text-xs text-text-primary break-all">
              set -a && source ~/.config/{APP_SLUG}/daemon.env && ./scripts/{APP_SLUG}-daemon.sh
            </code>
            <p className="text-xs text-text-muted">
              Config from <code className="font-mono">curl -fsSL {APP_URL}/api/agent/install | node - init --base-url {APP_URL}</code> or Settings → Agent tokens.
            </p>
          </>
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
