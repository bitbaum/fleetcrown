"use client";

import { useState } from "react";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { TerminalView } from "./TerminalView";
import { runnerTransport } from "./terminal-transport";
import { cn } from "@/lib/utils";

/**
 * "My machine" terminal source — live views of the agents Fleet Runner is
 * running on the user's machine. Lists the runner's open tabs
 * (/api/control/open-tabs) and streams the selected one via the existing
 * peek channel (raw-PTY bytes when the agent runs in a FleetCrown-owned PTY,
 * zellij snapshots otherwise). A typed line is sent into the agent via the
 * inject path (which routes to the owned PTY when present).
 */
export function LocalMachineView({
  initialTab,
  immersive = false,
}: {
  initialTab?: string | null;
  immersive?: boolean;
}) {
  const { data, loading } = useFetch<{ tabs: string[] }>("/api/control/open-tabs", { intervalMs: 5000 });
  const tabs = data?.tabs ?? [];
  const [selected, setSelected] = useState<string | null>(initialTab ?? null);
  const active = selected && tabs.includes(selected) ? selected : (tabs[0] ?? null);

  const send = async (text: string) => {
    if (!active) return;
    await fetch("/api/control/tab-inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab: active, prompt: text }),
    });
  };

  if (loading && tabs.length === 0) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
        <Loader2 className="ui-spinner" /> Looking for agents on your machine…
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div className="ui-empty-page">
        <MonitorSmartphone className="h-6 w-6 text-text-muted" />
        <p className="text-sm text-text-secondary">No agents running on your machine yet.</p>
        <p className="text-xs text-text-muted">Launch one from Control — it shows up here live.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2 md:flex-row md:gap-3", immersive && "gap-2")}>
      {tabs.length > 1 && (
        <select
          className="ui-input-compact shrink-0 md:hidden"
          value={active ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Agent tab"
        >
          {tabs.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
      <div className="hidden shrink-0 gap-1 overflow-x-auto md:flex md:w-40 md:flex-col md:overflow-y-auto">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelected(t)}
            className={`justify-start truncate ${t === active ? "ui-chip-toggle-active" : "ui-chip-toggle"}`}
            title={t}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {active && (
          <TerminalView
            key={active}
            transport={runnerTransport(active)}
            onSend={send}
            fill
            interactive
            compactChrome={immersive}
          />
        )}
      </div>
    </div>
  );
}
