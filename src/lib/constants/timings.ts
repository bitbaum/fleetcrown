/**
 * UI timing constants — single source of truth for setTimeout durations
 * across the app. Previously sites scattered 300/1200/1500/2000/3000/4000/6000
 * ms for the same UX intents (toast clears, copy feedback, modal auto-close,
 * search debounce), with sibling files disagreeing on the right value.
 *
 * Each constant names a *user-facing intent*, not a duration. Pick the one
 * that matches the intent at the call site; never inline a raw number.
 */

/** Search input debounce — keystroke → query trigger. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Modal auto-closes itself after a successful action. */
export const MODAL_AUTO_CLOSE_MS = 1200;

/** Quick action-feedback indicator: "Sent" / instant checkmarks. */
export const FEEDBACK_SHORT_MS = 1500;

/** Standard action-feedback indicator: "Copied", saved icon, sent badge. */
export const FEEDBACK_MEDIUM_MS = 2000;

/** Standard toast clear — informational, single-line message. */
export const TOAST_SHORT_MS = 3000;

/** Longer toast clear — errors needing read time, security-relevant confirms. */
export const TOAST_MEDIUM_MS = 4000;

/** Verbose toast — multi-line commit results, long error payloads. */
export const TOAST_LONG_MS = 6000;

/** Refresh /control state after a dispatch round-trip. The dispatch returned;
 *  give the daemon a beat to ack + reflect, then re-fetch so the UI shows
 *  the new state instead of the optimistic one. 500ms tuned against the
 *  bridge SSE fanout latency — slow enough to catch the daemon's state
 *  push, fast enough to feel instant to the user. */
export const REFRESH_AFTER_DISPATCH_MS = 500;

/** Refresh after a Zellij tab-side action (close-tab, tab-inject). Slightly
 *  longer than dispatch because Zellij's pane-state update can lag the
 *  command return; 700ms covers the observed window. */
export const REFRESH_AFTER_TAB_ACTION_MS = 700;

/** Refresh after launching a brand-new project workspace. Larger budget
 *  because the launch spawns Zellij + the agent CLI, both of which need a
 *  moment before /control can see them. */
export const REFRESH_AFTER_LAUNCH_MS = 1500;

/** Wait between launching an agent CLI and dispatching the first prompt
 *  into its newly-opened tab. The agent boots, prints its banner, and
 *  reaches the input prompt — write-chars sent before that point gets
 *  swallowed by the boot output. 3s is the observed worst case across
 *  claude/codex/gemini cold starts. */
export const AGENT_COLD_START_MS = 3000;
