"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Columns2, Rows2, X, Loader2, RotateCw } from "lucide-react";
import { TerminalView } from "./TerminalView";
import { workspaceTransport } from "./terminal-transport";
import type { AgentLifecycle } from "@/lib/agent-execution/types";
import type { SplitDir } from "@/lib/terminal-layout";
import { cn } from "@/lib/utils";
import { shortPath } from "@/lib/terminal-path";

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

/* The pane used to print the raw lifecycle enum — "provisioning", "starting" —
   straight into the header. Those are our words for our state machine, not an
   answer to the only question the operator is asking, which is whether this
   thing is working. */
const STATE_LABEL: Record<string, string> = {
  provisioning: "opening",
  starting: "starting",
  running: "ready",
  idle: "idle",
  exited: "closed",
  error: "failed",
};

/** One terminal pane: provisions a FleetCrown-owned bash PTY, streams it into
 *  xterm (via TerminalView), and terminates it on unmount (pane close or
 *  leaving the page). Kept mounted while the terminal page is open so switching
 *  tabs/splitting never drops the shell. */
export function TerminalLeaf({
  paneId,
  label,
  active,
  canClose,
  onFocus,
  onSplit,
  onClose,
}: Props) {
  const [wsId, setWsId] = useState<string | null>(null);
  const [state, setState] = useState<State>("provisioning");
  const [error, setError] = useState<string | null>(null);
  /** Where this shell actually runs. The operator asked for exactly this: when
   *  something is working, be able to see where it is working. */
  const [where, setWhere] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const provisionedRef = useRef<string | null>(null);

  const retry = useCallback(() => {
    setError(null);
    setWsId(null);
    setState("provisioning");
    setAttempt((n) => n + 1);
  }, []);

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
        setWhere(typeof body.cwd === "string" ? body.cwd : null);
        setHomeDir(typeof body.home === "string" ? body.home : undefined);
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
  }, [paneId, attempt]);

  return (
    <div className={cn("ui-term-pane", active && "ui-term-pane-active")}>
      <div className="ui-term-pane-head">
        <span className={cn("ui-term-dot", DOT[state] ?? "ui-dot-warning")} />
        <span className="ui-term-pane-label">{label}</span>
        <span className="ui-term-pane-state">{STATE_LABEL[state] ?? state}</span>
        {where && (
          <span className="ui-term-pane-where" title={where}>
            {shortPath(where, homeDir)}
          </span>
        )}
        <div className="ui-term-pane-actions hidden md:flex">
          <button
            type="button"
            title="Split right"
            onClick={() => onSplit("row")}
            className="ui-term-icon-btn"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Split down"
            onClick={() => onSplit("col")}
            className="ui-term-icon-btn"
          >
            <Rows2 className="h-3.5 w-3.5" />
          </button>
          {canClose && (
            <button
              type="button"
              title="Close pane"
              onClick={onClose}
              className="ui-term-icon-btn ui-term-icon-btn-danger"
            >
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
          <div className="ui-term-pane-error">
            <p>{error}</p>
            <button type="button" onClick={retry} className="ui-term-retry-btn">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : !wsId ? (
          <div className="ui-term-pane-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            Starting shell{where ? ` in ${shortPath(where, homeDir)}` : ""}…
            <button type="button" onClick={retry} className="ui-term-retry-btn">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : (
          <TerminalView
            transport={workspaceTransport(wsId)}
            interactive
            bare
            onStatus={setState}
            /* TerminalView already detects a wedged session, and does it from
               actual output rather than lifecycle state — which is the only
               signal that cannot claim "no output yet" over a screen with
               output on it. All this adds is the part it has no way to know:
               WHERE the silent shell is. */
            stalledHint={
              where
                ? `Connected, but nothing has come back from ${shortPath(where, homeDir)} — the shell may not have started.`
                : undefined
            }
            className="h-full w-full"
          />
        )}
      </div>
    </div>
  );
}
