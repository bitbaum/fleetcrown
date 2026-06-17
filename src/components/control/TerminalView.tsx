"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

/**
 * Live read-only terminal view (P1) + optional send-a-line (P2-lite).
 *
 * Subscribes to /api/control/peek-stream?tab=… and repaints an xterm.js
 * instance on each frame (a full dump-screen snapshot — see
 * docs/architecture/embedded-terminal.md). Read-only by default; when
 * `onSend` is provided a gated single-line input forwards text to the agent
 * via the existing inject path.
 */
export function TerminalView({ tab, onSend }: { tab: string; onSend?: (text: string) => Promise<void> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [line, setLine] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let es: EventSource | null = null;
    // Dynamic import keeps xterm out of the initial bundle — it only loads when
    // a terminal is actually opened.
    let cleanupTerm = () => {};

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;
      const term = new Terminal({
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 12,
        // Raw-PTY streams (append mode) are a byte log → keep scrollback so the
        // viewer can scroll back. Harmless for snapshot mode (which reset()s).
        scrollback: 5000,
        theme: { background: "#000000" },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      try { fit.fit(); } catch { /* host not laid out yet */ }
      const onResize = () => { try { fit.fit(); } catch { /* ignore */ } };
      window.addEventListener("resize", onResize);
      cleanupTerm = () => { window.removeEventListener("resize", onResize); term.dispose(); };

      es = new EventSource(`/api/control/peek-stream?tab=${encodeURIComponent(tab)}`);
      es.addEventListener("ready", () => setConnected(true));
      es.addEventListener("frame", (e: MessageEvent) => {
        try {
          const { frame, append } = JSON.parse(e.data) as { frame: string; append?: boolean };
          // Raw-PTY byte delta → append to the buffer (a true byte stream).
          // zellij snapshot → clear then write (full-screen repaint).
          if (append) {
            term.write(frame);
          } else {
            term.reset();
            term.write(frame);
          }
        } catch { /* ignore malformed frame */ }
      });
      es.onerror = () => setConnected(false);
    })();

    return () => {
      disposed = true;
      es?.close();
      cleanupTerm();
    };
  }, [tab]);

  const send = async () => {
    const text = line.trim();
    if (!text || !onSend) return;
    setSending(true);
    try { await onSend(text); setLine(""); } finally { setSending(false); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="ui-micro-label">{connected ? "live" : "connecting…"}</span>
        {onSend && (
          <button type="button" className="ui-btn-xs" onClick={() => setSendOpen((v) => !v)}>
            {sendOpen ? "Cancel" : "Send a line"}
          </button>
        )}
      </div>
      <div ref={hostRef} className="h-72 w-full overflow-hidden rounded-md bg-black" />
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
