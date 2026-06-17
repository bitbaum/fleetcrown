"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { AgentEvent, AgentLifecycle } from "@/lib/agent-execution/types";

/**
 * Live view of a FleetCrown-owned agent PTY: renders the workspace's byte stream
 * in xterm, sends keystrokes back. The substrate is the LocalPtyExecutor (and
 * later SandboxExecutor) — NOT zellij. Output arrives over SSE
 * (/api/workspaces/[id]/stream, resumable via Last-Event-ID); input/resize POST
 * to /api/workspaces/[id]. Drop-in replacement for the zellij screen-dump peek.
 */
export function WorkspaceTerminal({
  id,
  onStatus,
  className,
}: {
  id: string;
  onStatus?: (status: AgentLifecycle) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest onStatus without making the effect (and thus the PTY
  // connection) tear down/reconnect every render.
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      fontSize: 13,
      cursorBlink: true,
      convertEol: false,
      theme: { background: "#0a0a0a" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit();

    const encodedId = encodeURIComponent(id);
    const post = (body: unknown) =>
      fetch(`/api/workspaces/${encodedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => { /* transient — the stream stays the source of truth */ });

    const inputDisposable = term.onData((data) => post({ action: "input", data }));

    const syncSize = () => {
      try { fit.fit(); } catch { /* container not laid out yet */ }
      post({ action: "resize", cols: term.cols, rows: term.rows });
    };
    const resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(container);
    syncSize();

    const source = new EventSource(`/api/workspaces/${encodedId}/stream`);
    source.onmessage = (msg) => {
      let event: AgentEvent;
      try { event = JSON.parse(msg.data) as AgentEvent; } catch { return; }
      if (event.kind === "output" && event.data) term.write(event.data);
      else if (event.kind === "status" && event.status) onStatusRef.current?.(event.status);
      else if (event.kind === "exit") onStatusRef.current?.("exited");
    };

    return () => {
      source.close();
      resizeObserver.disconnect();
      inputDisposable.dispose();
      term.dispose();
    };
  }, [id]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
