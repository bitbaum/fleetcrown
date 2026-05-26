"use client";

import { Focus, PanelsTopLeft, RefreshCw, Terminal, Trash2, Wrench } from "lucide-react";
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
}: {
  rows: LiveTabRow[];
  daemonStateUnknown: boolean;
  dashboard: ControlDashboardState | null;
  refreshing: boolean;
  onRefresh: () => void;
  onFocusProject?: (tab: string) => void;
}) {
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

  return (
    <section className="ui-control-live-panel">
      <div className="ui-control-live-panel-header py-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <PanelsTopLeft className="h-3.5 w-3.5 shrink-0 text-accent-text" />
            <h2 className="text-xs font-semibold text-text-primary">Live Zellij</h2>
            <span className="ui-tag ui-tag-neutral text-[9px]">
              {daemonStateUnknown ? "offline" : `${rows.length} open`}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dashboard && !daemonStateUnknown && (
            <span className="ui-micro-label text-text-muted text-[9px]">
              {dashboard.runningCount} run · {dashboard.waitingCount} wait
            </span>
          )}
          {!daemonStateUnknown && (
            <button
              type="button"
              onClick={repairHelper}
              className="ui-btn-ghost ui-btn-xs gap-1 text-[10px]"
              title="Update and repair the local helper"
            >
              <Wrench className="h-3 w-3" />
              <span className="hidden sm:inline">Repair helper</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ui-btn-ghost ui-btn-xs gap-1 text-[10px]"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {daemonStateUnknown ? (
        <div className="ui-control-live-empty">
          <p className="font-medium text-text-secondary">No live tab data</p>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-text-tertiary">
            The cloud control plane needs your local daemon running and pushing state.
            Install Zellij, start an agent tab, then run the daemon from Settings.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="ui-control-live-empty">
          <p className="font-medium text-text-secondary">No Zellij tabs open</p>
          <p className="mt-1 text-sm text-text-tertiary">
            Open a project tab in Zellij or launch one from the fleet below.
          </p>
        </div>
      ) : (
        <>
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
                  <tr key={row.tabName}>
                    <td className="py-0.5">
                      <span className="font-medium text-text-primary">{row.tabName}</span>
                      {!row.registered && (
                        <span className="ml-1.5 ui-tag ui-tag-warning text-[9px]">Unreg</span>
                      )}
                    </td>
                    <td className="py-0.5 text-text-secondary">{row.agentLabel ?? "—"}</td>
                    <td className="py-0.5">
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </td>
                    <td className="py-0.5 max-w-md">
                      <p className="line-clamp-1 text-[11px] text-text-secondary" title={row.activity}>
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
              <div key={row.tabName} className="ui-control-live-card py-1.5 px-2">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-text-primary text-sm">{row.tabName}</span>
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </div>
                    {row.agentLabel && (
                      <p className="mt-0.5 text-[10px] text-text-tertiary">{row.agentLabel}</p>
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
                <p className="mt-1 text-[11px] leading-snug text-text-secondary line-clamp-2">
                  {row.activity}
                </p>
                {!row.registered && (
                  <p className="mt-1 text-[10px] text-status-warning">Not registered in fleet</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
