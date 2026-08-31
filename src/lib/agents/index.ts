/**
 * Agent adapter registry — SSOT for "every agent FleetCrown knows about."
 *
 * Adding a new agent (Cline, Aider, opencode, whatever ships next):
 *   1. Write `./newagent.ts` exporting `newagentAdapter: AgentAdapter`.
 *   2. Add it to `ALL_ADAPTERS` below.
 * That's it. No edits to `agent-registry.ts`, no edits to the dispatch
 * route, no edits to the UI's switch statements. The catalog, the
 * launcher, the availability badge, the install button all read from
 * the adapter automatically.
 *
 * The order of `ALL_ADAPTERS` is the UI display order (top-to-bottom
 * in the agent-switcher dropdown). Most-used / most-integrated agents
 * go first.
 */

import type { AgentAdapter } from "./types";
import { claudeAdapter } from "./claude";
import { grokAdapter } from "./grok";
import { cursorAdapter } from "./cursor";
import { codexAdapter } from "./codex";
import { openclawAdapter } from "./openclaw";
import { geminiAdapter } from "./gemini";
// Hermes is deliberately NOT an interactive adapter, but it IS a wired hosted
// executor — two different things, so keep the distinction straight:
//   • The interactive adapter (`hermesAdapter`, ./hermes.ts) is intentionally
//     kept OUT of ALL_ADAPTERS and ORCHESTRATION_ADAPTER_IDS. FleetCrown does
//     not offer "drive Hermes in a terminal tab" the way it offers claude/codex/
//     grok. That adapter file is preserved for a future interactive path; it is
//     not selectable today.
//   • The HOSTED path IS live and wired: `runHermesTask` (./hosted-runner/
//     run-hermes.ts) has a real call site in scripts/hosted-runner.ts, which the
//     `fleetcrown-hosted-runner.timer` drains (`hosted_dispatch` command type →
//     clone → Hermes in its sandbox → PR). The `hermes` CLI IS installed on the
//     box (/usr/local/bin/hermes, v0.17.0). inject-core auto-routes an offline
//     coding dispatch to it (hostedRunner:"hermes").
// Status (2026-07-22): hosted path plumbed + polling, but lightly exercised —
// one real Hermes PR to date (spike, 2026-06-25). It is observable now: hosted
// runs emit orchestration_events (source="hosted-runner", adapter="hermes"),
// visible in Activity. Not yet proven under volume.

export type {
  AgentAdapter,
  AgentCapabilities,
  AgentAvailability,
  AgentRuntimeConfig,
} from "./types";

/** Every agent FleetCrown knows about. Order = UI display order. */
export const ALL_ADAPTERS: readonly AgentAdapter[] = [
  claudeAdapter,
  grokAdapter,
  cursorAdapter,
  codexAdapter,
  openclawAdapter,
  geminiAdapter,
];

/** Find an adapter by its id. Returns undefined for unknown ids — callers
 *  decide whether that's a programming error (assert) or an external-input
 *  case (default to claude). */
export function findAdapter(id: string | null | undefined): AgentAdapter | undefined {
  if (!id) return undefined;
  return ALL_ADAPTERS.find((a) => a.id === id);
}

/** Effective model for an adapter = user-configured > adapter default. */
export function effectiveDefaultModel(adapter: AgentAdapter): string {
  return adapter.readConfiguredModel() ?? adapter.defaultModel;
}

/** Effective model suggestion list = effective default + adapter's own list,
 *  deduplicated, preserving order. Used by /control's model dropdown. */
export function effectiveModelSuggestions(adapter: AgentAdapter): readonly string[] {
  const effective = effectiveDefaultModel(adapter);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [effective, ...adapter.modelSuggestions]) {
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}
