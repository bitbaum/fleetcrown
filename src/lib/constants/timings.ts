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
