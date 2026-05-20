/**
 * Render a dispatch prompt.
 *
 * Reuses src/lib/orchestration/renderers.ts:renderTaskForAdapter as the SSOT
 * for the prompt text — duplicating the per-intent bodies in home/ would
 * diverge from the existing system as either side evolves. This module is
 * a thin adapter: home/-side input shape in, plain string out.
 *
 * Why thin: the worker layer (M7+ next milestone) will inject this string
 * directly into a zellij tab via send-text. No further transformation in
 * between.
 */

import type { AdapterId, OrchestrationTaskIntentId } from "@/lib/orchestration";
import { ORCHESTRATION_TASK_INTENT_IDS, renderTaskForAdapter } from "@/lib/orchestration";

export type RenderInput = {
  /** Project name from the events (zellij tab / display name). */
  project: string;
  /** Filesystem path. Falls back to project name if absent — the renderer uses
   *  this in lines like "Work on the project at <path>"; an agent already in
   *  the right cwd doesn't strictly need it, but real paths read better. */
  projectPath?: string;
  /** Which intent the brain decided on. Must be one of the canonical ids. */
  intent: OrchestrationTaskIntentId;
  /** Adapter the worker uses. Default claude — same as the current dispatch. */
  adapter?: AdapterId;
  /** Free-form prompt body when intent === 'custom' (queue items, ad-hoc text). */
  customInstructions?: string;
};

export function renderPromptForDispatch(input: RenderInput): string {
  return renderTaskForAdapter({
    projectKey:  input.project,
    projectPath: input.projectPath ?? input.project,
    adapter:     input.adapter ?? "claude",
    intent:      input.intent,
    customInstructions: input.customInstructions,
  });
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/render.ts
// Asserts every canonical intent produces a non-empty string and "custom"
// echoes its customInstructions.

function selfTest() {
  let pass = 0, fail = 0;
  for (const intent of ORCHESTRATION_TASK_INTENT_IDS) {
    const customBody = intent === "custom" ? "run security audit on Cockpit" : undefined;
    const out = renderPromptForDispatch({
      project: "Cockpit",
      projectPath: "/home/g/dev/cockpit",
      intent,
      customInstructions: customBody,
    });
    const ok = out.length > 0 && (intent !== "custom" || out.includes("security audit"));
    if (ok) { console.log(`  ✓ ${intent}`); pass++; }
    else    { console.log(`  ✗ ${intent} → got: ${JSON.stringify(out).slice(0, 100)}`); fail++; }
  }
  console.log(`\n${pass}/${pass + fail} intents render`);
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
