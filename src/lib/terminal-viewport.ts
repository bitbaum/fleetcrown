/**
 * Geometry rules for the one place a *viewer* can change the *source of truth*:
 * the browser terminal mirrors its own size onto the real PTY, so whatever the
 * window is doing gets typed into the session an agent is actually working in.
 *
 * Observed on prod 2026-08-15: opening /terminal in a short browser window
 * posted `{kind:"resize", tab:"Tab #1", cols:74, rows:1}` — twice — and the
 * runner applied it to the live zellij tab. A collapsed container (mid-mount,
 * a hidden panel, a phone with the keyboard up) is indistinguishable from an
 * intentional size once it has left the browser, and reflowing a running TUI to
 * one row loses its screen.
 *
 * So the invariant is: **a viewer may follow the session's size, never shrink
 * it below usability.** Two enforcement points, and they are different on
 * purpose — the client knows what it sent last and can stay silent; the server
 * knows nothing about the caller and can only floor what arrives.
 */

/**
 * Below any real viewport, above the garbage a collapsed container produces.
 * A 320px phone still measures ~45 cols; a mounting or hidden host measures 1.
 */
export const TERMINAL_MIN_COLS = 40;
export const TERMINAL_MIN_ROWS = 6;

export type PtyGeometry = { cols: number; rows: number };

/**
 * Client side: what (if anything) this measurement should publish to the PTY.
 *
 * `null` means stay silent — either the host is not laid out (degenerate), or
 * nothing changed. The second case matters as much as the first: ResizeObserver
 * fires on every layout pass, and each duplicate was a real POST that woke the
 * runner to re-apply a size it already had.
 */
export function ptyResizeToPublish(
  measured: PtyGeometry,
  lastPublished: PtyGeometry | null,
): PtyGeometry | null {
  const { cols, rows } = measured;
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  if (cols < TERMINAL_MIN_COLS || rows < TERMINAL_MIN_ROWS) return null;
  if (lastPublished && lastPublished.cols === cols && lastPublished.rows === rows) return null;
  return { cols, rows };
}

/**
 * Server side: floor whatever arrived. A caller that is not this app's terminal
 * (an old bundle, the desktop runner, a script) still cannot squash the tab.
 */
export function clampPtyGeometry({ cols, rows }: PtyGeometry): PtyGeometry & { clamped: boolean } {
  const next = {
    cols: Math.max(cols, TERMINAL_MIN_COLS),
    rows: Math.max(rows, TERMINAL_MIN_ROWS),
  };
  return { ...next, clamped: next.cols !== cols || next.rows !== rows };
}
