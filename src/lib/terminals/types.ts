/**
 * TerminalAdapter — the port that every terminal multiplexer plugs into.
 *
 * Pre-2026-06-07 src/lib/zellij.ts was 263 lines of hardcoded `zellij
 * action ...` shellouts. The pusher pushes Zellij tab names; the dispatch
 * pipeline assumes Zellij focus semantics; Peek shells out to `zellij
 * action dump-screen`. Supporting tmux or screen would have meant a
 * sprawling code search + per-function rewrite.
 *
 * The adapter pattern unifies all per-multiplexer knowledge into ONE
 * module per multiplexer. Adding tmux support is now: write
 * `src/lib/terminals/tmux.ts` implementing this interface, register it
 * in `./index.ts`. The whole dispatch pipeline works unchanged.
 *
 * Why this matters strategically: same answer as AgentAdapter — FleetCrown
 * isn't building a terminal multiplexer (Zellij/tmux/screen are decades
 * of work to compete with). We're building the coordination layer where
 * any multiplexer plugs in. A user on tmux should be a first-class
 * customer, not a "use Zellij or nothing" problem.
 *
 * The interface is sync where possible because most operations are
 * sub-100ms CLI shellouts and async overhead just adds noise. Async only
 * for ops that genuinely require it (tab listing on multi-session Zellij
 * fans out to N parallel queries).
 */

/** Adapter identity — short stable id used in DB rows + config files. */
export type TerminalId = "zellij" | "tmux" | "screen" | "browser-shell";

export interface TerminalAdapter {
  readonly id: TerminalId;
  /** Human-friendly name shown in UI ("Zellij", "tmux"). */
  readonly label: string;

  /** Is this multiplexer installed and reachable on the user's machine?
   *  Used by the first-launch wizard to suggest defaults. */
  detectAvailable(): boolean;

  /** Names of every open tab across all sessions. Empty when no
   *  multiplexer is running. Async because Zellij has multi-session
   *  fanout; tmux/screen impls can resolve synchronously and wrap. */
  listOpenTabs(): Promise<string[]>;

  /** Currently focused tab name, or null if nothing focused / multiplexer
   *  not running. */
  getActiveTab(): string | null;

  /** Switch focus to `tab`. Throws if the tab doesn't exist or doesn't
   *  become focused within an internal timeout (~1s). Callers that
   *  mutate the focused pane (inject, dump-screen) MUST chain through
   *  this first or the action lands on the wrong pane. */
  focusTab(tab: string): void;

  /** Type text into the focused pane of `tab` (with focus dance) +
   *  press Enter. The standard agent-prompt-injection primitive. */
  injectText(tab: string, text: string): void;

  /** Send a raw key code (e.g. 3 = Ctrl+C) without typing characters.
   *  Used for the cancel/interrupt path. */
  sendRawKey(tab: string, keyCode: number): void;

  /** Snapshot the visible+scrollback of `tab` as plain text (ANSI
   *  stripped). The Peek primitive. Sub-200ms round-trip with the
   *  focus-dance overhead. */
  dumpScreen(tab: string): string;

  /** Check whether a user is actively at an interactive shell prompt
   *  in `tab` right now. Used to suppress auto-inject when the user
   *  is mid-keystroke. Zellij implementation reads zsh-hook tmpfiles;
   *  other multiplexers may have their own signal or always-false
   *  (degrades to "always allow auto-inject"). */
  isUserTyping(tab: string): boolean;
}
