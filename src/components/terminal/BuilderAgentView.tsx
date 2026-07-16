"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { useBuilderPresence } from "@/hooks/use-builder-presence";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { TerminalView } from "./TerminalView";
import { TabVoiceMic } from "./TabVoiceMic";
import { runnerTransport } from "./terminal-transport";
import { cn } from "@/lib/utils";
import { rememberFleetProject } from "@/lib/fleet-context";

type Variant = "cloud" | "machine";

const COPY: Record<
  Variant,
  { loading: string; empty: string; emptyHint: string; offlineHint: string; stalledHint: string; icon: typeof MonitorSmartphone }
> = {
  cloud: {
    loading: EXECUTOR_COPY.terminal.cloudLoading,
    empty: EXECUTOR_COPY.terminal.cloudEmpty,
    emptyHint: EXECUTOR_COPY.terminal.cloudEmptyHint,
    offlineHint: EXECUTOR_COPY.terminal.cloudOfflineHint,
    stalledHint: EXECUTOR_COPY.terminal.cloudStalledHint,
    icon: MonitorSmartphone,
  },
  machine: {
    loading: EXECUTOR_COPY.terminal.thisComputerLoading,
    empty: EXECUTOR_COPY.terminal.thisComputerEmpty,
    emptyHint: EXECUTOR_COPY.terminal.thisComputerEmptyHint,
    offlineHint: EXECUTOR_COPY.terminal.thisComputerOfflineHint,
    stalledHint: EXECUTOR_COPY.terminal.thisComputerStalledHint,
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
  const presence = useBuilderPresence();
  // Is THIS builder actually connected? Distinguishes "offline" from "online but
  // idle" so the empty state stops mislabeling a working, idle builder as gated.
  const builderConnected =
    variant === "cloud" ? presence.builderPresence?.cloud : presence.builderPresence?.local;
  const tabs = data?.tabs ?? [];
  const [selected, setSelected] = useState<string | null>(initialTab ?? null);
  const active = selected && tabs.includes(selected) ? selected : (tabs[0] ?? null);

  useEffect(() => {
    if (active) rememberFleetProject(active);
  }, [active]);

  if (loading && tabs.length === 0) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
        <Loader2 className="ui-spinner" /> {copy.loading}
      </div>
    );
  }

  if (tabs.length === 0) {
    // Three honest states, in priority order:
    //   1. gated       → API returned `unavailable` (this account can't use it)
    //   2. offline      → allowed, but this builder isn't connected right now
    //   3. online-idle  → allowed + connected, just nothing running → offer to dispatch
    const gated = data?.unavailable?.message ?? null;
    const offline = builderConnected === false;
    const hint = gated ?? (offline ? copy.offlineHint : copy.emptyHint);
    const showDispatch = !gated && !offline;
    return (
      <div className="ui-empty-page">
        <Icon className="h-6 w-6 text-text-muted" />
        <p className="text-sm text-text-secondary">
          {offline ? copy.empty.replace("right now", "— builder offline") : copy.empty}
        </p>
        <p className="max-w-md text-center text-xs text-text-muted">{hint}</p>
        {showDispatch && (
          <Link href="/control" className="ui-btn-secondary mt-1">Dispatch from Control</Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Voice control-input: speak → transcribe → dispatch into the selected
          tab. Always visible above the split so it's equally reachable on phone
          (the primary use case) and desktop. */}
      {active && (
        <div className="flex shrink-0 items-center">
          <TabVoiceMic tab={active} channel={builderChannel} compact={immersive} />
        </div>
      )}
      <div className={cn("flex min-h-0 flex-1 flex-col gap-2 md:flex-row md:gap-3", immersive && "gap-2")}>
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
            stalledHint={copy.stalledHint}
          />
        )}
      </div>
      </div>
    </div>
  );
}
