"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { AgentLifecycle } from "@/lib/agent-execution/types";
import type { TerminalTransport } from "./terminal-transport";

/**
 * The ONE xterm view, parameterized by its transport (terminal-transport.ts).
 * Renders a workspace's / agent's byte stream, optionally captures keystrokes,
 * and keeps the PTY sized to the viewport. The substrate (server-owned PTY vs
 * Fleet Runner machine PTY) is entirely in the `transport` — this component is
 * substrate-agnostic.
 *
 * Two layouts:
 *  - `bare`: just the xterm host (the parent supplies its own header/status —
 *    e.g. TerminalLeaf). Use `className` to size it.
 *  - chrome (default): a connecting/live label, the terminal, and — when
 *    `onSend` is given — a gated single-line "Send a line" box.
 */
export function TerminalView({
  transport,
  interactive = false,
  onStatus,
  onSend,
  fill = false,
  bare = false,
  className,
}: {
  transport: TerminalTransport;
  /** Capture keystrokes (onData → transport.sendKey) and keep the PTY resized. */
  interactive?: boolean;
  /** Forward agent lifecycle (workspace substrate). */
  onStatus?: (status: AgentLifecycle) => void;
  /** Enables the gated single-line send box. */
  onSend?: (text: string) => Promise<void>;
  /** Fill the parent height (chrome layout only). */
  fill?: boolean;
  /** Render only the xterm host — no label, no send box. */
  bare?: boolean;
  /** Host div class (bare layout). */
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [line, setLine] = useState("");
  const [sending, setSending] = useState(false);

  // Keep the latest transport/onStatus without retearing the stream every render.
  const transportRef = useRef(transport);
  useEffect(() => { transportRef.current = transport; });
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disconnect = () => {};
    let cleanupTerm = () => {};

    // Dynamic import keeps xterm out of the initial bundle — it loads only when
    // a terminal is actually opened.
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;
      const transport = transportRef.current;

      const term = new Terminal({
        convertEol: transport.convertEol,
        cursorBlink: interactive,
        // Read-only peeks keep stdin disabled so the view never swallows page input.
        disableStdin: !interactive,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 13,
        scrollback: 5000,
        theme: { background: "#000000" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try { fit.fit(); } catch { /* host not laid out yet */ }

      // Serialize keystrokes through a single in-flight send chain so bytes never
      // race out of order under fast typing (the bug the server terminal had:
      // "echo" rendering as "ehco"). Bursts coalesce into fewer requests too.
      let inputBuffer = "";
      let flushing = false;
      const flushInput = async () => {
        if (flushing) return;
        flushing = true;
        try {
          while (inputBuffer) {
            const data = inputBuffer;
            inputBuffer = "";
            await transport.sendKey(data);
          }
        } finally {
          flushing = false;
        }
      };
      const inputDisposable = interactive
        ? term.onData((data) => { inputBuffer += data; void flushInput(); })
        : null;

      // ResizeObserver tracks both viewport and container changes — keeps the
      // remote PTY (interactive substrates) sized to what the viewer sees.
      const syncSize = () => {
        try { fit.fit(); } catch { /* container not laid out yet */ }
        if (interactive) transport.sendResize(term.cols, term.rows);
      };
      const resizeObserver = new ResizeObserver(syncSize);
      resizeObserver.observe(host);
      syncSize();

      disconnect = transport.connect({
        onOutput: (data) => term.write(data),
        onReset: () => term.reset(),
        onStatus: (status) => onStatusRef.current?.(status),
        onConnected: (c) => setConnected(c),
      });

      cleanupTerm = () => {
        resizeObserver.disconnect();
        inputDisposable?.dispose();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      disconnect();
      cleanupTerm();
    };
    // Re-run only when the substrate identity or interactivity changes; the
    // transport object itself is read through transportRef inside the effect.
  }, [transport.key, interactive]);

  if (bare) {
    return <div ref={hostRef} className={className ?? "h-full w-full"} />;
  }

  const send = async () => {
    const text = line.trim();
    if (!text || !onSend) return;
    setSending(true);
    try { await onSend(text); setLine(""); } finally { setSending(false); }
  };

  return (
    <div className={`flex flex-col gap-2 ${fill ? "h-full min-h-0" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="ui-micro-label">{connected ? "live" : "connecting…"}</span>
        {onSend && (
          <button type="button" className="ui-btn-xs" onClick={() => setSendOpen((v) => !v)}>
            {sendOpen ? "Cancel" : "Send a line"}
          </button>
        )}
      </div>
      <div ref={hostRef} className={`${fill ? "min-h-0 flex-1" : "h-72"} w-full overflow-hidden rounded-md bg-black`} />
      {onSend && sendOpen && (
        <div className="flex items-center gap-2">
          <input
            className="ui-input-compact flex-1"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            placeholder="Type a line to send into the terminal…"
            autoFocus
          />
          <button type="button" className="ui-btn-primary ui-btn-xs" onClick={() => void send()} disabled={sending || !line.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}
