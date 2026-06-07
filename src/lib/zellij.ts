/**
 * Compatibility shim over the terminal adapter registry.
 *
 * Pre-2026-06-07 this file was 263 lines of Zellij-specific shellouts.
 * Every consumer (api/control, api/orchestration, desktop poller, etc.)
 * imported function names like `getZellijTabs` and `injectIntoTab` from
 * here, baking the Zellij assumption into 15 call sites.
 *
 * Port 2 of the architecture cleanup moved the implementation into
 * `src/lib/terminals/zellij.ts` behind the `TerminalAdapter` interface
 * exported from `src/lib/terminals/index.ts`. This file is now a
 * thin shim that re-exports the historical names for back-compat. New
 * code should import from `@/lib/terminals` directly.
 *
 * Why the shim instead of touching all 15 callers right now: those edits
 * are mechanical and low-value (rename string in import). Doing them
 * incrementally as those files are touched for other reasons is fine.
 * The shim adds zero runtime overhead.
 */

import { zellijAdapter } from "@/lib/terminals/zellij";

export { shellEscape, getZellijSessionsSync } from "@/lib/terminals/zellij";

/** Currently-open Zellij tab names. Async because the multi-session
 *  scan can issue several CLI shellouts in sequence. */
export async function getZellijTabs(): Promise<string[]> {
  return zellijAdapter.listOpenTabs();
}

/** True when the user has an interactive shell at a prompt in `tab` —
 *  e.g. typing in zsh, not running an agent. ZSH hooks expose this via
 *  /tmp/${APP_SLUG}-typing-* freshness files. */
export function isUserTypingInTab(tab: string): boolean {
  return zellijAdapter.isUserTyping(tab);
}

/** Send a raw key code (e.g. 3 = Ctrl+C, 13 = Enter) to a tab without
 *  writing any characters first. */
export function sendRawKey(tab: string, keyCode: number): void {
  zellijAdapter.sendRawKey(tab, keyCode);
}

/** Type `prompt` into `tab` + press Enter (with focus dance). */
export function injectIntoTab(tab: string, prompt: string): void {
  zellijAdapter.injectText(tab, prompt);
}

/** Snapshot the visible scrollback of `tab` as plain text (ANSI stripped). */
export function peekTab(tab: string): string {
  return zellijAdapter.dumpScreen(tab);
}
