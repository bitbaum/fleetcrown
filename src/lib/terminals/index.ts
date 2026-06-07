/**
 * Terminal multiplexer adapter registry.
 *
 * Adding a new multiplexer (tmux, screen, browser-shell, kitty-tabs):
 *   1. Write `./tmux.ts` exporting `tmuxAdapter: TerminalAdapter`.
 *   2. Add it to `ALL_TERMINALS` below.
 * Same pattern as src/lib/agents — every consumer that needs to inject /
 * focus / dump-screen reads through this index, not through any specific
 * adapter file.
 *
 * Today Zellij is the only impl, so the resolver functions degenerate
 * to "return zellijAdapter". When a second impl lands, those functions
 * become real choice logic (detect installed, prefer user's configured
 * default, fall back to first available).
 */

import type { TerminalAdapter, TerminalId } from "./types";
import { zellijAdapter } from "./zellij";

export type { TerminalAdapter, TerminalId } from "./types";

/** Every terminal multiplexer FleetCrown knows about. Order = preference
 *  order for auto-detection (first installed one wins). */
export const ALL_TERMINALS: readonly TerminalAdapter[] = [
  zellijAdapter,
];

/** Find a multiplexer adapter by id. */
export function findTerminal(id: TerminalId | string | null | undefined): TerminalAdapter | undefined {
  if (!id) return undefined;
  return ALL_TERMINALS.find((t) => t.id === id);
}

/** Resolve the "active" multiplexer for the current host: first one in
 *  ALL_TERMINALS whose detectAvailable() returns true. Falls back to the
 *  first adapter regardless when none detect (so callers get a working
 *  reference instead of undefined; their next operation will fail loudly
 *  if the multiplexer truly isn't there). */
export function activeTerminal(): TerminalAdapter {
  for (const t of ALL_TERMINALS) {
    if (t.detectAvailable()) return t;
  }
  return ALL_TERMINALS[0];
}
