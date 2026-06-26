"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { AgentLifecycle } from "@/lib/agent-execution/types";
import type { TerminalTransport } from "./terminal-transport";

// Strip ANSI/VT escape sequences so URL detection sees plain text. URLs never
// contain ESC, so removing colour/cursor codes is enough to match cleanly.
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const URL_RE = /https?:\/\/[^\s"'`<>\\)\]}]+/g;

/** Pull whole URLs out of a chunk of terminal OUTPUT. The byte stream keeps each
 *  URL on one logical line even when xterm wraps it across visual rows, so this
 *  always recovers the complete link — the fix for "only the first line is
 *  clickable". Trailing sentence punctuation is trimmed. */
function extractUrls(text: string): string[] {
  const matches = text.replace(ANSI_RE, "").match(URL_RE) ?? [];
  return matches.map((u) => u.replace(/[.,;:!?)\]}]+$/, "")).filter(Boolean);
}

/** Real-DOM bar listing URLs detected in the terminal output — clickable + a
 *  one-click Copy each. Renders nothing until a URL appears, so it never steals
 *  terminal height. */
function LinkBar({ links, onDismiss }: { links: string[]; onDismiss: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (links.length === 0) return null;
  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(url);
      window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1500);
    }).catch(() => {});
  };
  return (
    <div className="ui-term-linkbar">
      <span className="ui-term-linkbar-label">Links</span>
      <div className="ui-term-linkbar-list">
        {links.map((url) => (
          <div key={url} className="ui-term-linkbar-row">
            <a className="ui-term-linkbar-url" href={url} target="_blank" rel="noopener noreferrer" title={url}>
              {url}
            </a>
            <button type="button" className="ui-term-linkbar-btn" onClick={() => copy(url)}>
              {copied === url ? "Copied" : "Copy"}
            </button>
            <a className="ui-term-linkbar-btn" href={url} target="_blank" rel="noopener noreferrer">
              Open
            </a>
          </div>
        ))}
      </div>
      <button type="button" className="ui-term-linkbar-dismiss" onClick={onDismiss} aria-label="Dismiss links">
        ✕
      </button>
    </div>
  );
}

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
  // URLs detected in the terminal output stream — surfaced by <LinkBar/>.
  const [links, setLinks] = useState<string[]>([]);

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

      // Copy-on-select: the reliable fix for "copying is impossible". xterm's
      // selection lives in its own canvas layer (not the DOM), so the browser's
      // native ⌘C copies nothing. Mirror every non-empty selection straight to
      // the system clipboard the moment it's made (terminal "primary selection"
      // behaviour) — no keypress, no focus dance required.
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
      });

      // Explicit copy: ⌘C / Ctrl-Shift-C when there's a selection (plain Ctrl-C
      // stays SIGINT so interrupting an agent still works). Paste is deliberately
      // left to xterm's built-in paste-event handler: it reads clipboardData on
      // the native paste event with no permission prompt, and intercepting ⌘V
      // here would DOUBLE-paste (our send + xterm's native paste both firing).
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
      // Debug/automation handle: reach the live xterm instance from devtools or
      // an e2e harness (e.g. to assert copy/paste wiring) via
      // `document.querySelector('.xterm')._fcTerm`. Harmless in prod.
      if (term.element) (term.element as HTMLElement & { _fcTerm?: unknown })._fcTerm = term;
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

      // Rolling tail of recent output (plain text) scanned for URLs. The stream
      // keeps each URL contiguous regardless of xterm's visual wrapping, so the
      // whole link is recovered and shown in <LinkBar/> — newest first, capped.
      let tail = "";
      disconnect = transport.connect({
        onOutput: (data) => {
          term.write(data);
          tail = (tail + data).slice(-8000);
          const urls = extractUrls(tail);
          if (urls.length) {
            setLinks((prev) => {
              const next = [...prev];
              for (const u of urls) if (!next.includes(u)) next.unshift(u);
              return next.length === prev.length ? prev : next.slice(0, 4);
            });
          }
        },
        onReset: () => { term.reset(); tail = ""; setLinks([]); },
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
    return (
      <div className={`flex flex-col ${className ?? "h-full w-full"}`}>
        <div ref={hostRef} className="min-h-0 flex-1" />
        <LinkBar links={links} onDismiss={() => setLinks([])} />
      </div>
    );
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
      <LinkBar links={links} onDismiss={() => setLinks([])} />
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
