"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { PanelsTopLeft, RefreshCw, Send, Terminal, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import { FEEDBACK_SHORT_MS } from "@/lib/constants/timings";
import type { ControlDashboardState, LiveTabRow } from "./control-presenter";
import { ZellijLiveRows } from "./ZellijLiveRows";

export function ZellijLivePanel({
  rows,
  daemonNeverSeen,
  daemonSyncStale = false,
  dashboard,
  refreshing,
  onRefresh,
  onFocusProject,
  highlightTab,
  initialTargetTab,
  panelRef,
  embedded = false,
}: {
  rows: LiveTabRow[];
  daemonNeverSeen: boolean;
  daemonSyncStale?: boolean;
  dashboard: ControlDashboardState | null;
  refreshing: boolean;
  onRefresh: () => void;
  onFocusProject?: (tab: string) => void;
  /** Row to visually emphasize (e.g. from a push notification deep-link). */
  highlightTab?: string | null;
  /** Pre-select this tab in the prompt composer. */
  initialTargetTab?: string | null;
  panelRef?: RefObject<HTMLElement | null>;
  /** Strip outer chrome when nested inside a parent shell (mobile details). */
  embedded?: boolean;
}) {
  const [targetTab, setTargetTab] = useState("");

  useEffect(() => {
    if (initialTargetTab) setTargetTab(initialTargetTab);
  }, [initialTargetTab]);
  const [prompt, setPrompt] = useState("");
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const tabOptions = useMemo(() => rows.map((row) => row.tabName), [rows]);
  const effectiveTarget = targetTab || tabOptions[0] || "";

  const focusTab = async (tabName: string) => {
    try {
      await postJson("/api/control/focus-tab", { tab: tabName });
    } catch { /* best effort */ }
  };

  const closeTab = async (tabName: string) => {
    if (!window.confirm(`Close the Zellij tab "${tabName}"?`)) return;
    try {
      const res = await postJson("/api/control/close-tab", { tab: tabName });
      if (res.ok) setTimeout(onRefresh, 700);
    } catch { /* best effort */ }
  };

  const repairHelper = async () => {
    try {
      const res = await postJson("/api/agent/repair-helper", {});
      if (res.ok) setTimeout(onRefresh, FEEDBACK_SHORT_MS);
    } catch { /* best effort */ }
  };

  const sendPrompt = async () => {
    if (!effectiveTarget || !prompt.trim() || sendingPrompt) return;
    setSendingPrompt(true);
    setSendError(null);
    try {
      const res = await postJson("/api/control/tab-inject", { tab: effectiveTarget, prompt: prompt.trim() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPrompt("");
      setTimeout(onRefresh, 700);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Prompt send failed");
    } finally {
      setSendingPrompt(false);
    }
  };

  return (
    <section ref={panelRef} className={cn("ui-control-live-panel", embedded && "ui-control-live-panel-embedded")}>
      <div className="ui-control-live-panel-header py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PanelsTopLeft className="h-3.5 w-3.5 shrink-0 text-accent-text" />
            {/* When embedded inside the mobile <details> wrapper, the parent
                <summary> already renders "Terminal workspaces" as its label —
                suppressing the inner H2 here so the same heading doesn't
                appear twice in the page (caught in browser dogfood
                2026-05-31: 2 H2s "Terminal workspaces" surfaced in a
                document.querySelectorAll scan). Desktop renders this panel
                directly with no surrounding summary, so the H2 still appears. */}
            {!embedded && <h2 className="text-xs font-semibold text-text-primary">Terminal workspaces</h2>}
            <span className="ui-tag ui-tag-neutral text-[9px]">
              {daemonNeverSeen ? "offline" : daemonSyncStale ? `${rows.length} open · stale` : `${rows.length} open`}
            </span>
          </div>
          {!daemonNeverSeen && (
            <p className="mt-0.5 text-micro text-text-tertiary">
              {daemonSyncStale
                ? "Showing last-known workspace state — local daemon sync is stale."
                : "Open tabs come from Zellij. Working and awaiting input come from live agent/process signals."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dashboard && !daemonNeverSeen && (
            <span className="ui-micro-label text-text-muted text-[9px]">
              {dashboard.runningCount} working · {dashboard.waitingCount} awaiting input
            </span>
          )}
          {!daemonNeverSeen && (
            <button
              type="button"
              onClick={repairHelper}
              className="ui-btn-ghost ui-btn-xs gap-1 text-micro"
              title="Update and repair the local helper"
            >
              <Wrench className="h-3 w-3" />
              <span className="hidden sm:inline">Repair connection</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ui-btn-ghost ui-btn-xs gap-1 text-micro"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {daemonNeverSeen ? (
        <div className="ui-control-live-empty">
          <div className="mb-2 text-text-tertiary">
            <Terminal className="mx-auto h-6 w-6" />
          </div>
          <p className="font-medium text-text-secondary">No live workspace data</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-tertiary">
            The cloud control plane needs your local daemon running and pushing state.
            Start an agent workspace, then check the local connection in Settings.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="ui-control-live-empty">
          <div className="mb-2 text-text-tertiary">
            <Terminal className="mx-auto h-6 w-6" />
          </div>
          <p className="font-medium text-text-secondary">No terminal workspaces open</p>
          <p className="mt-1 text-sm text-text-tertiary">
            Launch an agent from a project to open its terminal workspace.
          </p>
        </div>
      ) : (
        <>
          <div className="ui-control-live-composer">
            <select
              value={effectiveTarget}
              onChange={(event) => setTargetTab(event.target.value)}
              className="ui-control-live-select"
              aria-label="Target Zellij tab"
            >
              {tabOptions.map((tab) => (
                <option key={tab} value={tab}>{tab}</option>
              ))}
            </select>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  sendPrompt();
                }
              }}
              className="ui-control-live-input"
              placeholder="Send a prompt to any open tab"
              aria-label="Prompt for selected Zellij tab"
            />
            <button
              type="button"
              onClick={sendPrompt}
              disabled={sendingPrompt || !prompt.trim() || !effectiveTarget}
              className="ui-btn-primary ui-btn-xs gap-1.5"
              title="Send prompt"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </div>
          {sendError && <p className="text-xs text-status-negative">{sendError}</p>}

          <ZellijLiveRows
            rows={rows}
            highlightTab={highlightTab}
            focusTab={focusTab}
            closeTab={closeTab}
            onFocusProject={onFocusProject}
          />
        </>
      )}
    </section>
  );
}
