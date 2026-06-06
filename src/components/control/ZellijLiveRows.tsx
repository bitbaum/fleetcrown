"use client";

import { useEffect, useState } from "react";
import { Eye, Focus, Terminal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveTabRow } from "./control-presenter";
import { PeekTabDrawer } from "./PeekTabDrawer";

type Props = {
  rows: LiveTabRow[];
  /** Row to visually emphasize (push-notification deep-link). */
  highlightTab?: string | null;
  focusTab: (tabName: string) => void;
  closeTab: (tabName: string) => void;
  onFocusProject?: (tab: string) => void;
};

/**
 * Renders the live-tab rows in two flavors: a sortable-looking table at
 * md+ widths and a vertical card stack at smaller widths. Both are mounted
 * always — Tailwind toggles `hidden md:block` / `md:hidden`. Lives here
 * instead of inline inside ZellijLivePanel because the dual rendering is
 * ~150 lines and obscures the panel's actual orchestration (header,
 * composer, empty states).
 *
 * The Peek button (eye icon) is only useful inside Fleet Runner v0.7.2+ —
 * outside the desktop app the bridge isn't injected and the drawer shows
 * an "open in Fleet Runner" message. We detect once on mount and just hide
 * the button when there's nothing to peek with, rather than render a button
 * that always errors. Detection is sticky for the session so a brief
 * preload race doesn't permanently hide the action.
 */
export function ZellijLiveRows({ rows, highlightTab, focusTab, closeTab, onFocusProject }: Props) {
  const [peekTab, setPeekTab] = useState<string | null>(null);
  const [hasPeek, setHasPeek] = useState(false);

  useEffect(() => {
    // Defer one tick so preload finishes injecting window.fleetRunner before
    // we read the bridge methods.
    const id = setTimeout(() => {
      if (typeof window !== "undefined" && typeof window.fleetRunner?.peekTab === "function") {
        setHasPeek(true);
      }
    }, 60);
    return () => clearTimeout(id);
  }, []);

  const isHighlighted = (tabName: string) =>
    Boolean(highlightTab && tabName.toLowerCase() === highlightTab.toLowerCase());

  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="ui-control-live-table text-xs">
          <thead>
            <tr>
              <th>Tab</th>
              <th>Agent</th>
              <th>State</th>
              <th>Activity</th>
              <th className="w-28 text-right">Actions</th>
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
                    {hasPeek && (
                      <button
                        type="button"
                        onClick={() => setPeekTab(row.tabName)}
                        className="ui-icon-action p-0.5"
                        title={`Peek terminal contents of ${row.tabName}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
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
                {hasPeek && (
                  <button
                    type="button"
                    onClick={() => setPeekTab(row.tabName)}
                    className="ui-icon-action p-0.5"
                    title="Peek"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
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

      {peekTab && <PeekTabDrawer tab={peekTab} onClose={() => setPeekTab(null)} />}
    </>
  );
}
