"use client";

import { useState } from "react";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { TerminalView } from "./TerminalView";
import { runnerTransport } from "./terminal-transport";
import { cn } from "@/lib/utils";

type Variant = "cloud" | "machine";

const COPY: Record<
  Variant,
  { loading: string; empty: string; emptyHint: string; icon: typeof MonitorSmartphone }
> = {
  cloud: {
    loading: EXECUTOR_COPY.terminal.cloudLoading,
    empty: EXECUTOR_COPY.terminal.cloudEmpty,
    emptyHint: EXECUTOR_COPY.terminal.cloudEmptyHint,
    icon: MonitorSmartphone,
  },
  machine: {
    loading: EXECUTOR_COPY.terminal.thisComputerLoading,
    empty: EXECUTOR_COPY.terminal.thisComputerEmpty,
    emptyHint: EXECUTOR_COPY.terminal.thisComputerEmptyHint,
    icon: MonitorSmartphone,
  },
};

/**
 * Live agent tabs from the builder (box-runner on cloud, desktop Fleet Runner locally).
 * Lists `/api/control/open-tabs` and streams the selected tab via peek-stream.
 * Fully interactive — keystrokes route to the matching builder (cloud vs local).
 */
export function BuilderAgentView({
  variant,
  initialTab,
  immersive = false,
}: {
  variant: Variant;
  initialTab?: string | null;
  immersive?: boolean;
}) {
  const copy = COPY[variant];
  const Icon = copy.icon;
  const builderChannel = variant === "cloud" ? "cloud" as const : "local" as const;
  const { data, loading } = useFetch<{ tabs: string[]; unavailable?: { code: string; message: string } }>(
    `/api/control/open-tabs?channel=${builderChannel}`,
    { intervalMs: 5000 },
  );
  const tabs = data?.tabs ?? [];
  const [selected, setSelected] = useState<string | null>(initialTab ?? null);
  const active = selected && tabs.includes(selected) ? selected : (tabs[0] ?? null);

  if (loading && tabs.length === 0) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
        <Loader2 className="ui-spinner" /> {copy.loading}
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div className="ui-empty-page">
        <Icon className="h-6 w-6 text-text-muted" />
        <p className="text-sm text-text-secondary">{copy.empty}</p>
        <p className="max-w-md text-center text-xs text-text-muted">{data?.unavailable?.message ?? copy.emptyHint}</p>
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
            transport={runnerTransport(active, builderChannel)}
            fill
            interactive
            compactChrome={immersive}
          />
        )}
      </div>
    </div>
  );
}
