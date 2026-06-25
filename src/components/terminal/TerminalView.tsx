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
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }, { TERMINAL_THEME }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-web-links"),
        import("@/lib/terminal-theme"),
      ]);
      if (disposed) return;
      const transport = transportRef.current;

      // xterm draws into a canvas/WebGL context where CSS variables DON'T resolve,
      // so "var(--font-mono)" silently fell back to generic monospace — the "awful
      // font". Resolve the real family from CSS, and wait for the web font to load
      // first, or xterm measures the fallback glyph and mis-sizes every cell.
      await document.fonts.ready;
      if (disposed) return;
      const cssMono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
      const fontFamily = [cssMono, "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
        .filter(Boolean)
        .join(", ");

      const term = new Terminal({
        convertEol: transport.convertEol,
        cursorBlink: interactive,
        // Read-only peeks keep stdin disabled so the view never swallows page input.
        disableStdin: !interactive,
        fontFamily,
        fontSize: 14,
        lineHeight: 1.2,
        letterSpacing: 0,
        scrollback: 5000,
        theme: TERMINAL_THEME,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      // Clickable URLs — open in a new tab (the gap that made `claude setup-token`
      // links un-clickable). noopener/noreferrer for safety.
      term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, "_blank", "noopener,noreferrer")));

      // Copy: ⌘C (mac) or Ctrl/⌘-Shift-C → clipboard when there's a selection.
      // Plain Ctrl-C stays SIGINT (don't break interrupting an agent). This is
      // why copying "was impossible" — xterm doesn't copy-on-select by default.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const key = e.key.toLowerCase();
        const isCopy = (e.metaKey && key === "c") || (e.ctrlKey && e.shiftKey && key === "c");
        if (isCopy && term.hasSelection()) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          return false; // handled — don't forward to the PTY
        }
        return true;
      });

      term.open(host);
      // Default (DOM) renderer on purpose: it draws glyphs with the browser's
      // native font engine, so text is crisp + identical to the rest of the page.
      // WebGL is faster but rasterizes to a texture atlas that can blur text on
      // fractional-DPR displays — wrong trade for a readability-first terminal.
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
