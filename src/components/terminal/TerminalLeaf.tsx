"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Rows2, X, Loader2 } from "lucide-react";
import { TerminalView } from "./TerminalView";
import { workspaceTransport } from "./terminal-transport";
import type { AgentLifecycle } from "@/lib/agent-execution/types";
import type { SplitDir } from "@/lib/terminal-layout";
import { cn } from "@/lib/utils";

type Props = {
  /** Stable pane id — also the workspace projectKey. */
  paneId: string;
  label: string;
  active: boolean;
  canClose: boolean;
  onFocus: () => void;
  onSplit: (dir: SplitDir) => void;
  onClose: () => void;
};

type State = AgentLifecycle | "provisioning" | "error";

const DOT: Record<string, string> = {
  starting: "ui-dot-warning",
  running: "ui-dot-positive",
  idle: "ui-dot-warning",
  exited: "ui-dot-negative",
  provisioning: "ui-dot-warning",
  error: "ui-dot-negative",
};

/** One terminal pane: provisions a FleetCrown-owned bash PTY, streams it into
 *  xterm (via TerminalView), and terminates it on unmount (pane close or
 *  leaving the page). Kept mounted while the terminal page is open so switching
 *  tabs/splitting never drops the shell. */
export function TerminalLeaf({ paneId, label, active, canClose, onFocus, onSplit, onClose }: Props) {
  const [wsId, setWsId] = useState<string | null>(null);
  const [state, setState] = useState<State>("provisioning");
  const [error, setError] = useState<string | null>(null);
  const provisionedRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectKey: paneId, command: "bash", args: ["-il"] }),
        });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setState("error");
          setError(body?.error ?? `Failed to start shell (HTTP ${res.status})`);
          return;
        }
        provisionedRef.current = body.workspace.id as string;
        setWsId(provisionedRef.current);
        setState(body.workspace.status as AgentLifecycle);
      } catch (e) {
        if (!alive) return;
        setState("error");
        setError(e instanceof Error ? e.message : "Failed to start shell");
      }
    })();
    return () => {
      alive = false;
      const id = provisionedRef.current;
      if (id) {
        fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "terminate" }),
        }).catch(() => {});
      }
    };
  }, [paneId]);

  return (
    <div className={cn("ui-term-pane", active && "ui-term-pane-active")}>
      <div className="ui-term-pane-head">
        <span className={cn("ui-term-dot", DOT[state] ?? "ui-dot-warning")} />
        <span className="ui-term-pane-label">{label}</span>
        <span className="ui-term-pane-state">{state}</span>
        <div className="ui-term-pane-actions hidden md:flex">
          <button type="button" title="Split right" onClick={() => onSplit("row")} className="ui-term-icon-btn">
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Split down" onClick={() => onSplit("col")} className="ui-term-icon-btn">
            <Rows2 className="h-3.5 w-3.5" />
          </button>
          {canClose && (
            <button type="button" title="Close pane" onClick={onClose} className="ui-term-icon-btn ui-term-icon-btn-danger">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Focus follows clicks into the terminal body (not the header), so the
          split/close buttons are never preceded by a focus re-render that would
          swallow their first click. */}
      <div className="ui-term-pane-body" onMouseDown={onFocus}>
        {state === "error" ? (
          <div className="ui-term-pane-error">{error}</div>
        ) : !wsId ? (
          <div className="ui-term-pane-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting shell…
          </div>
        ) : (
          <TerminalView transport={workspaceTransport(wsId)} interactive bare onStatus={setState} className="h-full w-full" />
        )}
      </div>
    </div>
  );
}
