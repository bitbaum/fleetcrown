"use client";

// Desktop-only — surfaces which agent CLIs are missing from the user's PATH
// so they don't dispatch into the void. Calls window.fleetRunner.getInstalledCLIs()
// (added in v0.6.0); falls back to rendering nothing on older builds.
//
// Each missing CLI gets an "Install Claude" / "Install Codex" / etc. button
// that POSTs to /api/agent/install-cli, which the local daemon picks up and
// turns into a zellij tab with the installer command pre-typed. The user
// approves the install in the terminal — never blind.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Terminal, ExternalLink, RefreshCw } from "lucide-react";
import type { FleetRunnerBridge } from "./types";
import { AGENT_LABELS, type AnyAgentId } from "@/lib/agent-labels";

type Detected = { zellij: boolean; agents: Record<string, boolean> };

const AGENTS_TO_CHECK: AnyAgentId[] = ["claude", "codex", "grok", "gemini", "cursor"];

function hasIPC(b: Window["fleetRunner"]): b is Pick<FleetRunnerBridge, "getInstalledCLIs"> {
  return typeof b?.getInstalledCLIs === "function";
}

export function MissingCLIsBanner() {
  const [detected, setDetected] = useState<Detected | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  // Hidden when:
  //  - Not running inside Fleet Runner (no IPC) → always null
  //  - Inside Fleet Runner but the build is older than v0.6.0 (no
  //    getInstalledCLIs method) → null, since older builds didn't have
  //    the scan endpoint
  //  - All checked tools detected → null
  useEffect(() => {
    const bridge = window.fleetRunner;
    if (!hasIPC(bridge)) return;
    bridge.getInstalledCLIs().then(setDetected).catch(() => {
      // Silent: we don't want to render a "couldn't scan your PATH" error.
      // The user can still mint a token + dispatch; the dispatch failure
      // (CLI-not-found) will surface in /history if it actually happens.
    });
  }, []);

  if (!detected) return null;

  const missingAgents = AGENTS_TO_CHECK.filter((a) => !detected.agents[a]);
  const missingZellij = !detected.zellij;
  if (missingAgents.length === 0 && !missingZellij) return null;

  async function installAgent(agent: string) {
    setInstalling(agent);
    try {
      await fetch("/api/agent/install-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent }),
      });
      // Best effort: queue the install command for the daemon to pick up.
      // The user sees it land in a zellij tab. We don't poll for completion
      // here — the next refresh of getInstalledCLIs will reflect success.
    } catch {
      // Same silent-fail rationale as above.
    } finally {
      setInstalling(null);
    }
  }

  async function refresh() {
    const bridge = window.fleetRunner;
    if (!hasIPC(bridge)) return;
    setRefreshing(true);
    try {
      const next = await bridge.getInstalledCLIs();
      setDetected(next);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="ui-callout-warning">
      <div className="mt-0.5 shrink-0 text-status-warning">
        <Terminal className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-medium text-text-primary">Missing local tools</span>
            <p className="text-sm text-text-secondary mt-0.5">
              Fleet Runner dispatches agents into zellij tabs. The following weren&apos;t found on your PATH:
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="ui-btn-icon"
            title="Re-scan PATH"
            aria-label="Re-scan PATH"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {missingZellij && (
            <a
              href="https://zellij.dev/documentation/installation"
              target="_blank"
              rel="noreferrer"
              className="ui-btn-secondary ui-btn-xs inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Install Zellij
            </a>
          )}
          {missingAgents.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => installAgent(id)}
              disabled={installing === id}
              className="ui-btn-secondary ui-btn-xs gap-1 disabled:opacity-50"
            >
              {installing === id ? "Queuing…" : `Install ${AGENT_LABELS[id]}`}
            </button>
          ))}
        </div>

        <p className="ui-micro-label text-text-tertiary">
          Each &quot;Install&quot; opens a zellij tab with the installer command pre-typed — review it before pressing Enter.
          {" "}
          <Link href="/docs/quickstart" className="text-accent underline">
            Need help?
          </Link>
        </p>
      </div>
    </section>
  );
}
