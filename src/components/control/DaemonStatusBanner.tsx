"use client";

import { useState } from "react";
import { X, Radio, WifiOff } from "lucide-react";
import { timeAgo } from "@/lib/dates";
import { APP_SLUG } from "@/config/brand";

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
            {daemonNeverSeen ? "Local daemon not connected" : "Local daemon offline"}
          </span>
          {!daemonNeverSeen && lastSeen && (
            <span className="ml-2 text-xs text-text-tertiary">last seen {lastSeen}</span>
          )}
        </div>

        <p className="text-text-secondary leading-relaxed">
          {daemonNeverSeen
            ? "Commands are queued and will run once the daemon connects. Start it on your local machine:"
            : "Commands will queue until the daemon reconnects. Restart it on your local machine:"}
        </p>

        <code className="block rounded-lg bg-surface-overlay px-3 py-2 font-mono text-xs text-text-primary break-all">
          APP_DAEMON_TOKEN=&lt;your-token&gt; ./scripts/{APP_SLUG}-daemon.sh
        </code>

        <p className="text-xs text-text-muted">
          The token is the value of <code className="text-text-tertiary">APP_DAEMON_TOKEN</code> (or legacy <code className="text-text-tertiary">COCKPIT_DAEMON_TOKEN</code>) in your local <code className="text-text-tertiary">.env.local</code>.
        </p>
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
