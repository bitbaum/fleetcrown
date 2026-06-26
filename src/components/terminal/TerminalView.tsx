"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import type { AgentLifecycle } from "@/lib/agent-execution/types";
import type { TerminalTransport } from "./terminal-transport";

const URL_RE = /https?:\/\/[^\s"'`<>\\)\]}]+/g;

/** Reconstruct whole URLs from the rendered terminal BUFFER (not the raw byte
 *  stream). TUI tools — ink, e.g. `claude setup-token` — HARD-wrap long URLs to
 *  the terminal width in their output, so the bytes split the URL across lines
 *  with no soft-wrap marker; scanning the stream yields only the first segment
 *  (the "link is cut off" bug). The grid is unambiguous though: a row whose
 *  trimmed text fills the full width continued onto the next row. Join those
 *  full-width runs back into logical lines, then match. Handles plainly-printed
 *  URLs (single short line) and width-wrapped ones alike. */
function extractUrlsFromBuffer(term: import("@xterm/xterm").Terminal): string[] {
  const buf = term.buffer.active;
  const cols = term.cols;
  const urls = new Set<string>();
  let logical = "";
  const flush = () => {
    for (const u of logical.match(URL_RE) ?? []) urls.add(u.replace(/[.,;:!?)\]}]+$/, ""));
    logical = "";
  };
  // Scan a bounded recent window; back up to a logical-line boundary so a URL
  // that began just above the window isn't captured truncated.
  let start = Math.max(0, buf.length - 300);
  while (start > 0 && (buf.getLine(start - 1)?.translateToString(true).length ?? 0) === cols) start--;
  for (let i = start; i < buf.length; i++) {
    const text = buf.getLine(i)?.translateToString(true) ?? "";
    logical += text;
    if (text.length < cols) flush(); // row didn't fill the width → logical line ended
  }
  flush();
  return [...urls];
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
      const [{ Terminal }, { FitAddon }, { TERMINAL_THEME }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
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
      // Clickable URLs that survive wrapping. The stock web-links addon detects
      // per visual row, so a URL wrapped across rows (ink TUIs hard-wrap to the
      // width) is clickable only on row 1 and opens a TRUNCATED link — the
      // "link is broken into pieces" bug. This provider reconstructs the whole
      // URL from the full-width row run, then highlights its cells on EVERY row
      // it spans; clicking any piece opens the complete link in a new tab.
      const linkProvider = term.registerLinkProvider({
        provideLinks(viewportY, callback) {
          const buf = term.buffer.active;
          const cols = term.cols;
          const absRow = buf.viewportY + (viewportY - 1);
          const lineLen = (i: number) => buf.getLine(i)?.translateToString(true).length ?? 0;
          // Span the logical line: a row that fills the full width continued below.
          let start = absRow;
          while (start > 0 && lineLen(start - 1) === cols) start--;
          let end = absRow;
          while (lineLen(end) === cols) end++;
          let logical = "";
          let rowOffset = -1;
          for (let i = start; i <= end; i++) {
            if (i === absRow) rowOffset = logical.length;
            logical += buf.getLine(i)?.translateToString(true) ?? "";
          }
          if (rowOffset < 0) { callback(undefined); return; }
          const rowLen = lineLen(absRow);
          const links: import("@xterm/xterm").ILink[] = [];
          for (const m of logical.matchAll(URL_RE)) {
            const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
            const uStart = m.index ?? 0;
            const uEnd = uStart + url.length;
            // Intersect the URL's span with the cells this row contributes.
            const segStart = Math.max(uStart, rowOffset);
            const segEnd = Math.min(uEnd, rowOffset + rowLen);
            if (segStart >= segEnd) continue;
            links.push({
              text: url,
              range: { start: { x: segStart - rowOffset + 1, y: viewportY }, end: { x: segEnd - rowOffset, y: viewportY } },
              decorations: { underline: true, pointerCursor: true },
              activate: () => window.open(url, "_blank", "noopener,noreferrer"),
            });
          }
          callback(links.length ? links : undefined);
        },
      });

      // Copy-on-select: the reliable fix for "copying is impossible". xterm's
      // selection lives in its own canvas layer (not the DOM), so the browser's
      // native ⌘C copies nothing. Mirror every non-empty selection straight to
      // the system clipboard the moment it's made (terminal "primary selection"
      // behaviour) — no keypress, no focus dance required.
      term.onSelectionChange(() => {
        const sel = term.getSelection();
        if (sel) navigator.clipboard?.writeText(sel).catch(() => {});
      });

      // Cross-platform copy/paste. The OS-standard paste — ⌘V (mac) / Ctrl-V
      // (Linux/Win) — is left to xterm's built-in paste handler: it reads
      // clipboardData on the browser's native paste event, no permission prompt,
      // and intercepting it here would DOUBLE-paste. We handle only the *terminal*
      // shortcuts the browser does NOT paste for: Ctrl-Shift-V / ⌘⇧V. Those get
      // an explicit preventDefault() so that even if a browser does emit a native
      // paste for the combo, exactly one paste runs.
      //   Copy: ⌘C / Ctrl-Shift-C with a selection (plain Ctrl-C stays SIGINT, so
      //   interrupting an agent still works); copy-on-select already covers the
      //   common case above.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        const key = e.key.toLowerCase();
        const isCopy = (e.metaKey && key === "c") || (e.ctrlKey && e.shiftKey && key === "c");
        if (isCopy && term.hasSelection()) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          return false; // handled — don't forward to the PTY
        }
        const isShiftPaste = e.shiftKey && (e.ctrlKey || e.metaKey) && key === "v";
        if (isShiftPaste && interactive) {
          e.preventDefault(); // guarantee a single paste even if the browser also pastes
          navigator.clipboard?.readText().then((t) => { if (t) void transport.sendKey(t); }).catch(() => {});
          return false;
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

      // Scan the rendered buffer for URLs (newest first, capped) and surface them
      // in <LinkBar/>. Debounced: run once output settles, after xterm has laid
      // the bytes into the grid — only then can full-width rows be joined back
      // into whole URLs. Kept after the URL leaves the screen on a TUI redraw.
      let scanTimer = 0;
      const scheduleScan = () => {
        if (scanTimer) return;
        scanTimer = window.setTimeout(() => {
          scanTimer = 0;
          const urls = extractUrlsFromBuffer(term);
          if (urls.length) {
            setLinks((prev) => {
              const next = [...prev];
              for (const u of urls) if (!next.includes(u)) next.unshift(u);
              return next.length === prev.length ? prev : next.slice(0, 4);
            });
          }
        }, 150);
      };
      disconnect = transport.connect({
        onOutput: (data) => { term.write(data); scheduleScan(); },
        onReset: () => { term.reset(); setLinks([]); },
        onStatus: (status) => onStatusRef.current?.(status),
        onConnected: (c) => setConnected(c),
      });

      cleanupTerm = () => {
        if (scanTimer) window.clearTimeout(scanTimer);
        linkProvider.dispose();
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
