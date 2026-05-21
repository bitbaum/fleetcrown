"use client";

import { Focus, PanelsTopLeft, RefreshCw, Terminal } from "lucide-react";
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

  return (
    <section className="ui-control-live-panel">
      <div className="ui-control-live-panel-header">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <PanelsTopLeft className="h-4 w-4 shrink-0 text-accent-text" />
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">Live Zellij workspaces</h2>
            <span className="ui-tag ui-tag-neutral">
              {daemonStateUnknown ? "daemon offline" : `${rows.length} open`}
            </span>
          </div>
          <p className="text-sm text-text-tertiary">
            Open tabs, which agent is in each, and what it is doing right now.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {dashboard && !daemonStateUnknown && (
            <>
              <span className="ui-micro-label text-text-muted">
                {dashboard.runningCount} running · {dashboard.waitingCount} waiting
              </span>
            </>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="ui-btn-ghost ui-btn-xs gap-1.5"
            title="Refresh fleet state"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
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
            <table className="ui-control-live-table">
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
                    <td>
                      <span className="font-medium text-text-primary">{row.tabName}</span>
                      {!row.registered && (
                        <span className="ml-2 ui-tag ui-tag-warning">Unregistered</span>
                      )}
                    </td>
                    <td className="text-text-secondary">{row.agentLabel ?? "—"}</td>
                    <td>
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </td>
                    <td className="max-w-md">
                      <p className="line-clamp-2 text-sm text-text-secondary" title={row.activity}>
                        {row.activity}
                      </p>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => focusTab(row.tabName)}
                          className="ui-icon-action"
                          title={`Focus ${row.tabName} in Zellij`}
                        >
                          <Terminal className="h-4 w-4" />
                        </button>
                        {row.project && onFocusProject && (
                          <button
                            type="button"
                            onClick={() => onFocusProject(row.project!.tab)}
                            className="ui-icon-action"
                            title="Expand project in Control"
                          >
                            <Focus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <div key={row.tabName} className="ui-control-live-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-text-primary">{row.tabName}</span>
                      <span className={row.stateTagClass}>{row.stateLabel}</span>
                    </div>
                    {row.agentLabel && (
                      <p className="mt-1 text-xs text-text-tertiary">{row.agentLabel}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => focusTab(row.tabName)}
                      className="ui-icon-action"
                      title="Focus in Zellij"
                    >
                      <Terminal className="h-4 w-4" />
                    </button>
                    {row.project && onFocusProject && (
                      <button
                        type="button"
                        onClick={() => onFocusProject(row.project!.tab)}
                        className="ui-icon-action"
                        title="Expand project"
                      >
                        <Focus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary line-clamp-3">
                  {row.activity}
                </p>
                {!row.registered && (
                  <p className="mt-2 text-xs text-status-warning">Not registered in fleet</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
