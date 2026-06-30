/**
 * ANSI escape stripping — SSOT.
 *
 * Two places previously implemented this independently:
 *   - `cleanZellijLines` in `src/lib/zellij.ts` (stripped CSI color sequences
 *     in `query-tab-names` output)
 *   - `peekTab` in `src/lib/zellij.ts` (stripped CSI + OSC in dump-screen
 *     output — broader than cleanZellijLines)
 *
 * The two regexes drifted: peek caught OSC title-set / hyperlink sequences
 * (`\x1b][^\x07]*\x07`) that the older zellij output cleaner missed.
 * Consolidated here so any future caller (terminal-stream rendering, log
 * tail in /control, prompt-history previews) sees the same behavior.
 *
 * Patterns covered:
 *   - CSI: `ESC [ … letter`  (color, cursor moves, mode switches)
 *   - OSC: `ESC ] … BEL`     (terminal title, hyperlink) — terminated by BEL
 */
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ANSI_OSC_RE = /\x1b\][^\x07]*\x07/g;

/** Remove ANSI color, cursor-movement, and terminal-title escape sequences
 *  from `s`. Returns plain text safe to render in `<pre>` or feed to a
 *  text-only diff. Does not normalize whitespace or line endings — callers
 *  who care about that should layer their own `.trim()` / `.replace(/\r\n/g, "\n")`
 *  on top. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_CSI_RE, "").replace(ANSI_OSC_RE, "");
}
