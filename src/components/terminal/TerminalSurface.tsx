"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { deriveExecutorHonestyLabel } from "@/lib/executor-honesty";
import { useFetch } from "@/hooks/use-fetch";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { useTerminalFont } from "@/hooks/use-terminal-font";
import { useTerminalDeck } from "@/hooks/use-terminal-deck";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { rememberFleetProject } from "@/lib/fleet-context";
import { resolveTabAttachment, type PtyGeometry } from "@/lib/terminal-viewport";
import type { BuilderChannel } from "@/lib/event-stream-types";
import {
  TERMINAL_MODE_STORAGE_KEY,
  type TerminalInputMode,
  type TerminalSource,
} from "@/config/terminal-modes";
import type { TerminalContext } from "@/app/api/terminal/context/route";
import { TerminalView } from "./TerminalView";
import { TerminalTabStrip } from "./TerminalTabStrip";
import { TerminalSessionBar, TerminalSourceBar } from "./TerminalModeBar";
import { TerminalComposer } from "./TerminalComposer";
import { TerminalLaunch } from "./TerminalLaunch";
import { TabVoiceMic } from "./TabVoiceMic";
import { ShellWorkspace } from "./ShellWorkspace";
import { TerminalSessionMiss } from "./TerminalSessionMiss";
import { TerminalMobileHeader, type TerminalLiveState } from "./TerminalMobileHeader";
import { TerminalSessionSheet } from "./TerminalSessionSheet";
import { TerminalMobileDock } from "./TerminalMobileDock";
import { runnerTransport } from "./terminal-transport";
import { useTerminalTabs } from "./use-terminal-tabs";

/** Per-source copy. Cloud and machine differ only in wording, so the strings
 *  stay in the copy SSOT and this map just selects between them. */
const COPY: Record<"cloud" | "machine", {
  loading: string; empty: string; emptyHint: string; offlineHint: string; stalledHint: string;
}> = {
  cloud: {
    loading: EXECUTOR_COPY.terminal.cloudLoading,
    empty: EXECUTOR_COPY.terminal.cloudEmpty,
    emptyHint: EXECUTOR_COPY.terminal.cloudEmptyHint,
    offlineHint: EXECUTOR_COPY.terminal.cloudOfflineHint,
    stalledHint: EXECUTOR_COPY.terminal.cloudStalledHint,
  },
  machine: {
    loading: EXECUTOR_COPY.terminal.thisComputerLoading,
    empty: EXECUTOR_COPY.terminal.thisComputerEmpty,
    emptyHint: EXECUTOR_COPY.terminal.thisComputerEmptyHint,
    offlineHint: EXECUTOR_COPY.terminal.thisComputerOfflineHint,
    stalledHint: EXECUTOR_COPY.terminal.thisComputerStalledHint,
  },
};

const channelFor = (source: TerminalSource): BuilderChannel => (source === "machine" ? "local" : "cloud");

/** Comfortably under the 4000-byte cap the raw-key route enforces on one write.
 *  Multi-byte characters make length-in-chars an under-estimate of bytes, and
 *  halving the budget is cheaper than counting UTF-8 at every keystroke. */
const RAW_KEY_CHUNK = 1500;

type TerminalMode = { source: TerminalSource; input: TerminalInputMode };

const DEFAULT_MODE: TerminalMode = { source: "cloud", input: "type" };

// Module-level so their identity is stable across renders — useLocalStorageState
// keeps them in effect dependency arrays.
const serializeMode = (mode: TerminalMode) => JSON.stringify(mode);
const deserializeMode = (raw: string): TerminalMode => {
  try {
    const parsed = JSON.parse(raw) as Partial<TerminalMode>;
    return {
      source: parsed.source ?? DEFAULT_MODE.source,
      input: parsed.input ?? DEFAULT_MODE.input,
    };
  } catch {
    return DEFAULT_MODE;
  }
};

/**
 * The terminal — one shell, three substrates.
 *
 * The previous version of this file was a source toggle over two structurally
 * different UIs: a tabbed, splittable workspace (server-owned PTYs, reachable
 * only when RUNTIME_AVAILABLE=true, so never on the hosted app) and a sidebar
 * list of agent tabs beside a single read-mostly xterm. Switching source
 * changed the layout, the tab metaphor and the available actions all at once,
 * and neither half offered any way to change agent or to compose a task — those
 * lived on Control, acting on the same session from another page.
 *
 * Now the chrome is constant: tab strip, mode bar, session, composer. The
 * source picks which transport fills the session; the input mode picks what
 * happens to what you type. Nothing about navigating changes when you switch.
 *
 * ── The phone ───────────────────────────────────────────────────────────────
 * Below `md` the same state drives a different chrome, because the desktop one
 * had failed on a phone in two ways at once.
 *
 * It was too big: title, subtitle, source strip, tab strip, source select,
 * session select, agent button, mode select, honesty chip, font stepper — 331px
 * of controls, measured, above a terminal left with four visible lines of an
 * eighty-column screen. All of it setup, none of it read while an agent works.
 * It is now one header row and a sheet behind it.
 *
 * And it was inert: a phone keyboard has no arrows, no Esc, no Tab and no Ctrl,
 * which are exactly the keys an agent's questions are answered with. You could
 * read "[✔] Also scan shell history · ◄ Mixed ► · Continue" and had no way to
 * say anything back. TerminalKeyDeck is that missing half of the keyboard, and
 * it is why this page is now something you can work in rather than watch.
 */
export function TerminalSurface({
  local,
  immersive = false,
  onToggleImmersive,
  initialSource,
  initialTab,
}: {
  local: boolean;
  immersive?: boolean;
  /** Phone full-screen toggle — rendered inside the mobile control bar. */
  onToggleImmersive?: () => void;
  initialSource?: TerminalSource;
  initialTab?: string | null;
}) {
  // "shell" — a FleetCrown-owned bash PTY — is only offered where one can
  // actually be provisioned. On the hosted control plane it is absent rather
  // than present-and-broken.
  const sources: TerminalSource[] = local ? ["cloud", "machine", "shell"] : ["cloud", "machine"];

  const [mode, setMode] = useLocalStorageState<TerminalMode>(
    TERMINAL_MODE_STORAGE_KEY,
    DEFAULT_MODE,
    serializeMode,
    deserializeMode,
  );
  // Precedence: what the user just clicked > the deep link that opened the page
  // > the remembered mode. Reading the deep link on every render instead would
  // pin the source forever — arriving via ?source=cloud made the toggle inert,
  // because each click was immediately overruled by the unchanged URL.
  const [pickedSource, setPickedSource] = useState<TerminalSource | null>(null);
  const desiredSource = pickedSource ?? initialSource ?? mode.source;
  const source: TerminalSource = sources.includes(desiredSource) ? desiredSource : "cloud";
  const inputMode = mode.input;
  const setSource = (next: TerminalSource) => {
    setPickedSource(next);
    setMode((m) => ({ ...m, source: next }));
  };
  const setInputMode = (next: TerminalInputMode) => setMode((m) => ({ ...m, input: next }));

  const channel = channelFor(source);
  const copy = COPY[source === "machine" ? "machine" : "cloud"];
  const { tabs, loading, gatedMessage, offline, presence } = useTerminalTabs(channel);

  const [selected, setSelected] = useState<string | null>(initialTab ?? null);
  // A ?tab= deep link that matched nothing must not quietly attach to whatever
  // else is running — see resolveTabAttachment for the incident this encodes.
  const { activeTab, deepLinkMiss } = resolveTabAttachment({
    requestedTab: initialTab,
    selected,
    tabs,
    loading,
  });

  // The terminal is one of the four project surfaces, so the tab you are
  // watching IS the fleet's active project — Control, Loki and the project
  // profile follow you here instead of resetting.
  useEffect(() => { if (activeTab) rememberFleetProject(activeTab); }, [activeTab]);

  // One transport per attached session, shared by the view that renders it and
  // the key deck that writes into it. Both need the same PTY; making it here
  // rather than inline at the view keeps "which session am I typing into"
  // impossible to get wrong.
  const transport = useMemo(
    () => (activeTab ? runnerTransport(activeTab, channel) : null),
    [activeTab, channel],
  );
  // Awaited chunk-by-chunk: /api/control/tab-inject-raw caps one write at 4000
  // bytes, and the composer will happily hand over a pasted paragraph. Sending
  // the pieces without awaiting would let them arrive out of order — the same
  // "echo" → "ehco" reordering TerminalView's own input buffer exists to stop.
  const sendKey = useCallback((bytes: string) => {
    if (!transport) return;
    void (async () => {
      for (let i = 0; i < bytes.length; i += RAW_KEY_CHUNK) {
        await transport.sendKey(bytes.slice(i, i + RAW_KEY_CHUNK));
      }
    })();
  }, [transport]);

  // Phone chrome state. Font and stream status are owned here rather than
  // inside TerminalView because the controls that read them now live outside
  // it — the header shows the live dot, the sheet steps the font.
  const font = useTerminalFont();
  const deck = useTerminalDeck();
  const keyboardInset = useKeyboardInset();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [liveState, setLiveState] = useState<TerminalLiveState>("connecting");
  const [geometry, setGeometry] = useState<PtyGeometry | null>(null);

  const honesty = deriveExecutorHonestyLabel(
    source === "machine"
      ? { runnerConnected: presence.builderPresence?.local ?? presence.runnerConnected, runtimeAvailable: false, scope: "machine" }
      : { runnerConnected: presence.runnerConnected, runtimeAvailable: local || presence.runtimeAvailable, scope: "cloud" },
  );

  // Agent roster + tab→dir, on the same cadence as the tab list.
  const { data: context } = useFetch<TerminalContext>(
    `/api/terminal/context?channel=${channel}`,
    { intervalMs: 15000 },
  );
  const agents = useMemo(
    () => (context?.agents.agents ?? []).filter((a) => a.switchable),
    [context],
  );
  const tabContext = context?.tabs.find((t) => t.tab === activeTab) ?? null;
  const activeAgentId = tabContext?.agentPref ?? context?.agents.defaultAgent ?? null;

  const [switchingAgent, setSwitchingAgent] = useState(false);
  const agentSwitchDisabledReason = !activeTab
    ? "Open a session first — switching swaps the CLI running in a tab."
    : !tabContext?.dir
      ? `“${activeTab}” isn’t linked to a project directory, so FleetCrown doesn’t know where to relaunch the agent.`
      : null;

  const switchAgent = useCallback(async (agentId: string) => {
    if (!activeTab || !tabContext?.dir) return;
    setSwitchingAgent(true);
    try {
      await postJson("/api/control/switch-agent", {
        tab: activeTab,
        dir: tabContext.dir,
        toAgent: agentId,
        ...(activeAgentId ? { fromAgent: activeAgentId } : {}),
      });
    } catch { /* the session itself remains the source of truth on screen */ }
    finally { setSwitchingAgent(false); }
  }, [activeTab, tabContext?.dir, activeAgentId]);

  // The strip tells the truth about each tab: the project it resolves to (by
  // name, or by pane cwd for generically named tabs) and the agent CLI actually
  // running in it — so "Tab #1 · claude" and "Tab #2 · grok" are distinguishable
  // without clicking through.
  const stripTabs = useMemo(
    () => tabs.map((tab) => {
      const ctx = context?.tabs.find((t) => t.tab === tab);
      const badge = ctx?.liveAgents.length ? ctx.liveAgents.join("+") : undefined;
      const label = ctx?.projectName ?? tab;
      return {
        id: tab,
        label,
        badge,
        title: [label !== tab ? tab : null, badge].filter(Boolean).join(" — ") || undefined,
        dot: tab === activeTab ? "ui-dot-positive" : undefined,
      };
    }),
    [tabs, activeTab, context],
  );

  // Where we looked, and the one place we haven't — both named in the miss
  // state, since "not on Cloud" and "nowhere" are very different news.
  const sourceLabel = source === "machine"
    ? EXECUTOR_COPY.terminal.thisComputerLabel
    : EXECUTOR_COPY.terminal.cloudLabel;
  const otherSourceLabel =
    source === "machine"
      ? sources.includes("cloud")
        ? EXECUTOR_COPY.terminal.cloudLabel
        : null
      : sources.includes("machine")
        ? EXECUTOR_COPY.terminal.thisComputerLabel
        : null;

  // Constant across substrates: scope on top, then the tab strip, then the
  // controls that act on the selected tab.
  const sourceBar = (
    <div className="hidden md:block">
      <TerminalSourceBar
        source={source}
        onSourceChange={setSource}
        sources={sources}
        honesty={honesty}
      />
    </div>
  );

  // The phone's one header row. What it names is what changes: which session,
  // what is running in it, whether it is alive. Everything else is one tap
  // behind it, in the sheet.
  const headerTitle = source === "shell"
    ? "Shell"
    : (stripTabs.find((t) => t.id === activeTab)?.label ?? activeTab ?? sourceLabel);
  const headerAgent = source === "shell"
    ? null
    : (stripTabs.find((t) => t.id === activeTab)?.badge ?? null);
  const headerState: TerminalLiveState = !activeTab && source !== "shell" ? "idle" : liveState;

  const mobileHeader = (
    <TerminalMobileHeader
      title={headerTitle}
      agent={headerAgent}
      state={headerState}
      onOpenSheet={() => setSheetOpen(true)}
      immersive={immersive}
      onToggleImmersive={onToggleImmersive ?? (() => {})}
    />
  );

  const sheet = sheetOpen ? (
    <TerminalSessionSheet
      onClose={() => setSheetOpen(false)}
      source={source}
      sources={sources}
      onSourceChange={setSource}
      // The shell substrate owns its own tabs and splits, and runs no agent —
      // so it gets the source and display sections and none of the per-session
      // ones. Passing the agent path's activeTab through would offer to switch
      // the agent in a session the shell is not showing.
      tabs={source === "shell" ? undefined : stripTabs}
      activeTab={source === "shell" ? null : activeTab}
      onSelectTab={source === "shell" ? undefined : setSelected}
      inputMode={inputMode}
      onInputModeChange={setInputMode}
      agents={agents}
      activeAgentId={activeAgentId}
      onSwitchAgent={(id) => void switchAgent(id)}
      switchingAgent={switchingAgent}
      agentSwitchDisabledReason={agentSwitchDisabledReason}
      honesty={honesty}
      font={font}
      columns={geometry?.cols ?? null}
      liveKeys={deck.liveKeys}
      onLiveKeysChange={deck.setLiveKeys}
    />
  ) : null;

  // Sit the chrome on top of the soft keyboard instead of under it. See
  // useKeyboardInset: the layout viewport does not shrink when the keyboard
  // opens, so without this the key deck is drawn behind the keys.
  const rootStyle = keyboardInset ? { paddingBottom: keyboardInset } : undefined;

  // ── Server shell ────────────────────────────────────────────────────────
  // Its own PTYs, its own tabs and splits — but rendered with the same chrome,
  // so the only thing that changes is what is inside the panes.
  if (source === "shell") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2" style={rootStyle}>
        {sourceBar}
        <div className="md:hidden">{mobileHeader}</div>
        <div className="min-h-0 flex-1">
          <ShellWorkspace />
        </div>
        {sheet}
      </div>
    );
  }

  // ── Agent sessions ──────────────────────────────────────────────────────
  const body = () => {
    if (deepLinkMiss) {
      return (
        <TerminalSessionMiss
          requestedTab={initialTab!}
          sourceLabel={sourceLabel}
          otherSourceLabel={otherSourceLabel}
          available={tabs}
          onAttach={setSelected}
          onSwitchSource={() => setSource(source === "machine" ? "cloud" : "machine")}
        />
      );
    }
    if (loading && tabs.length === 0) {
      return (
        <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
          <Loader2 className="ui-spinner" /> {copy.loading}
        </div>
      );
    }
    if (tabs.length === 0) {
      // Three honest states, in priority order: gated (this account may not use
      // this builder) → offline (allowed, nothing connected) → online-but-idle
      // (allowed and connected, just nothing running → offer the next step).
      // Deep link ?tab=X with no session is the common Install/Implement Watch
      // dead-end — say so plainly instead of a generic empty cloud.
      const tabHint = initialTab && !offline && !gatedMessage
        ? `No live agent session for “${initialTab}”. If you just clicked Implement or Install, open Control — Attention shows Retry when the prompt never started. Terminal only shows sessions that are actually running.`
        : null;
      const hint = gatedMessage ?? (offline ? copy.offlineHint : (tabHint ?? copy.emptyHint));
      const controlHref = initialTab
        ? `/control?focus=${encodeURIComponent(initialTab)}`
        : "/control";
      return (
        <div className="ui-empty-page">
          <MonitorSmartphone className="h-6 w-6 text-text-muted" aria-hidden="true" />
          <p className="text-sm text-text-secondary">
            {offline ? copy.empty.replace("right now", "— builder offline") : copy.empty}
          </p>
          <p className="max-w-md text-center text-xs text-text-muted">{hint}</p>
          {!gatedMessage && !offline && (
<>
              <TerminalLaunch
                projects={context?.launchable ?? []}
                agents={agents}
                defaultAgent={context?.agents.defaultAgent ?? null}
                channel={channel}
              />
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Link href={controlHref} className="ui-btn-secondary">Open on Control</Link>
                <Link href="/loki" className="ui-btn-secondary">Ask Loki</Link>
              </div>
            </>
          )}
        </div>
      );
    }
    return (
      <TerminalView
        key={`${channel}:${activeTab}`}
        transport={transport!}
        fill
        // Only Type mode captures keystrokes, and only where the operator
        // actually wants the canvas to have the keyboard. In Prompt and Voice
        // mode — and on a phone by default, where typing happens in the dock's
        // composer — the session stays readable and the page keeps its own
        // keyboard, so Alt+N tab switching and the composer are not swallowed
        // by the PTY.
        interactive={inputMode === "type" && deck.liveKeys}
        compactChrome={immersive}
        stalledHint={copy.stalledHint}
        font={font}
        onLive={setLiveState}
        onGeometry={setGeometry}
      />
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" style={rootStyle}>
      {sourceBar}
      <div className="md:hidden">{mobileHeader}</div>
      <div className="hidden md:block">
        <TerminalTabStrip
          tabs={stripTabs}
          activeId={activeTab}
          onSelect={setSelected}
        />
      </div>
      {activeTab && (
        <div className="hidden md:block">
          <TerminalSessionBar
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            agents={agents}
            activeAgentId={activeAgentId}
            onSwitchAgent={(id) => void switchAgent(id)}
            switchingAgent={switchingAgent}
            agentSwitchDisabledReason={agentSwitchDisabledReason}
          />
        </div>
      )}
      <div className={cn("min-h-0 flex-1", immersive && "min-h-0")}>{body()}</div>

      {/* Desktop composers. The phone's live in the dock below, alongside the
          key deck, so there is exactly one stack of controls under the screen
          rather than a composer here and a keyboard somewhere else. */}
      {activeTab && inputMode === "prompt" && (
        <div className="hidden md:block"><TerminalComposer tab={activeTab} /></div>
      )}
      {activeTab && inputMode === "voice" && (
        <div className="hidden shrink-0 items-center md:flex">
          <TabVoiceMic tab={activeTab} channel={channel} compact={immersive} />
        </div>
      )}

      {activeTab && (
        <TerminalMobileDock
          tab={activeTab}
          channel={channel}
          inputMode={inputMode}
          onKey={sendKey}
          liveKeys={deck.liveKeys}
          immersive={immersive}
        />
      )}

      {sheet}
    </div>
  );
}
