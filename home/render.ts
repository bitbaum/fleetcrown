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
  /** Optional snapshot of the user's prompt queue for this project. Threaded
   *  through to renderTaskForAdapter so the dispatched prompt body surfaces
   *  "User's prompt queue for this project" — symmetric with the cloud
   *  /api/orchestration/run path (RunOrchestrationBody.queue). Without this,
   *  home/'s autonomous dispatches would render the bare next_best scan
   *  instruction with no queue context. */
  queue?: string[];
};

export function renderPromptForDispatch(input: RenderInput): string {
  return renderTaskForAdapter({
    projectKey: input.project,
    projectPath: input.projectPath ?? input.project,
    adapter: input.adapter ?? "claude",
    intent: input.intent,
    customInstructions: input.customInstructions,
    queue: input.queue,
  });
}

// ── Self-test ────────────────────────────────────────────────────────────────
// Run with: npx tsx home/render.ts
// Asserts every canonical intent produces a non-empty string, "custom"
// echoes its customInstructions, and the queue field threads through to
// renderQueueBlock in the underlying renderTaskForAdapter.

function selfTest() {
  let pass = 0,
    fail = 0;
  for (const intent of ORCHESTRATION_TASK_INTENT_IDS) {
    const customBody = intent === "custom" ? "run security audit on FleetCrown" : undefined;
    const out = renderPromptForDispatch({
      project: "FleetCrown",
      projectPath: "/home/g/dev/fleetcrown",
      intent,
      customInstructions: customBody,
    });
    const ok = out.length > 0 && (intent !== "custom" || out.includes("security audit"));
    if (ok) {
      console.log(`  ✓ ${intent}`);
      pass++;
    } else {
      console.log(`  ✗ ${intent} → got: ${JSON.stringify(out).slice(0, 100)}`);
      fail++;
    }
  }

  // Queue-block regression coverage — pins the contract that 1cacfd2 +
  // e6bd03b rely on. If a future change to renderQueueBlock breaks the
  // "User's prompt queue" header or the item ordering, these tests fail.
  const queueCases: { name: string; check: () => boolean }[] = [
    {
      name: "queue items render under 'User's prompt queue for this project'",
      check: () => {
        const out = renderPromptForDispatch({
          project: "FleetCrown",
          intent: "next_best",
          queue: ["fix tests", "ship the docs"],
        });
        return (
          out.includes("User's prompt queue for this project") &&
          out.includes("1. fix tests") &&
          out.includes("2. ship the docs")
        );
      },
    },
    {
      name: "empty queue → no queue block rendered",
      check: () => {
        const out = renderPromptForDispatch({
          project: "FleetCrown",
          intent: "next_best",
          queue: [],
        });
        return !out.includes("User's prompt queue");
      },
    },
    {
      name: "undefined queue → no queue block rendered (back-compat)",
      check: () => {
        const out = renderPromptForDispatch({ project: "FleetCrown", intent: "next_best" });
        return !out.includes("User's prompt queue");
      },
    },
    {
      name: "queue > 10 items shows the first 10 plus an overflow indicator",
      check: () => {
        const items = Array.from({ length: 13 }, (_, i) => `item ${i + 1}`);
        const out = renderPromptForDispatch({
          project: "FleetCrown",
          intent: "next_best",
          queue: items,
        });
        return (
          out.includes("1. item 1") &&
          out.includes("10. item 10") &&
          !out.includes("11. item 11") &&
          out.includes("…and 3 more")
        );
      },
    },
  ];
  for (const c of queueCases) {
    if (c.check()) {
      console.log(`  ✓ ${c.name}`);
      pass++;
    } else {
      console.log(`  ✗ ${c.name}`);
      fail++;
    }
  }

  console.log(`\n${pass}/${pass + fail} intents render`);
  if (fail > 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  selfTest();
}
