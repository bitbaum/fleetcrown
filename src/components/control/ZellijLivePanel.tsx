"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Focus, PanelsTopLeft, RefreshCw, Send, Terminal, Trash2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { postJson } from "@/lib/api/fetch";
import type { ControlDashboardState, LiveTabRow } from "./control-presenter";

export function ZellijLivePanel({
  rows,
  daemonStateUnknown,
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
  daemonStateUnknown: boolean;
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
      if (res.ok) setTimeout(onRefresh, 1500);
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

  const isHighlighted = (tabName: string) =>
    Boolean(highlightTab && tabName.toLowerCase() === highlightTab.toLowerCase());

  return (
    <section ref={panelRef} className={cn("ui-control-live-panel", embedded && "ui-control-live-panel-embedded")}>
      <div className="ui-control-live-panel-header py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PanelsTopLeft className="h-3.5 w-3.5 shrink-0 text-accent-text" />
            <h2 className="text-xs font-semibold text-text-primary">Terminal workspaces</h2>
            <span className="ui-tag ui-tag-neutral text-[9px]">
              {daemonStateUnknown ? "offline" : `${rows.length} open`}
            </span>
          </div>
          {!daemonStateUnknown && (
            <p className="mt-0.5 text-micro text-text-tertiary">
              Open tabs come from Zellij. Working and awaiting input come from live agent/process signals.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dashboard && !daemonStateUnknown && (
            <span className="ui-micro-label text-text-muted text-[9px]">
              {dashboard.runningCount} working · {dashboard.waitingCount} awaiting input
            </span>
          )}
          {!daemonStateUnknown && (
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

      {daemonStateUnknown ? (
        <div className="ui-control-live-empty">
          <p className="font-medium text-text-secondary">No live workspace data</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-tertiary">
            The cloud control plane needs your local daemon running and pushing state.
            Start an agent workspace, then check the local connection in Settings.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="ui-control-live-empty">
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

          <div className="hidden md:block overflow-x-auto">
            <table className="ui-control-live-table text-xs">
              <thead>
                <tr>
                  <th>Tab</th>
                  <th>Agent</th>
                  <th>State</th>
                  <th>Activity</th>
                  <th className="w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.tabName} className={cn(isHighlighted(row.tabName) && "ui-control-live-row-highlight")}>
                    <td className="py-0.5">
                      <span className="font-medium text-text-primary">{row.tabName}</span>
                      {!row.registered && (
                        <span className="ml-1.5 ui-tag ui-tag-warning text-[9px]">Unlinked</span>
                      )}
                    </td>
                    <td className="py-0.5 text-text-secondary">{row.agentLabel ?? "—"}</td>
                    <td className="py-0.5">
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </td>
                    <td className="py-0.5 max-w-md">
                      <p className="line-clamp-1 text-xs text-text-secondary" title={row.activity}>
                        {row.activity}
                      </p>
                    </td>
                    <td className="py-0.5 text-right">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => focusTab(row.tabName)}
                          className="ui-icon-action p-0.5"
                          title={`Focus ${row.tabName}`}
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => closeTab(row.tabName)}
                          className="ui-icon-action p-0.5"
                          title={`Close ${row.tabName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {row.project && onFocusProject && (
                          <button
                            type="button"
                            onClick={() => onFocusProject(row.project!.tab)}
                            className="ui-icon-action p-0.5"
                            title="Expand"
                          >
                            <Focus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5 md:hidden">
            {rows.map((row) => (
              <div
                key={row.tabName}
                className={cn("ui-control-live-card py-1.5 px-2", isHighlighted(row.tabName) && "ui-control-live-row-highlight")}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-text-primary text-sm">{row.tabName}</span>
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </div>
                    {row.agentLabel && (
                      <p className="mt-0.5 text-micro text-text-tertiary">{row.agentLabel}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => focusTab(row.tabName)}
                      className="ui-icon-action p-0.5"
                      title="Focus"
                    >
                      <Terminal className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => closeTab(row.tabName)}
                      className="ui-icon-action p-0.5"
                      title="Close tab"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {row.project && onFocusProject && (
                      <button
                        type="button"
                        onClick={() => onFocusProject(row.project!.tab)}
                        className="ui-icon-action p-0.5"
                        title="Expand"
                      >
                        <Focus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs leading-snug text-text-secondary line-clamp-2">
                  {row.activity}
                </p>
                {!row.registered && (
                  <p className="mt-1 text-micro text-status-warning">Not linked to a tracked project</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
