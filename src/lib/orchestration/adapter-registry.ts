import type { AdapterId, OrchestrationSeam } from "./contract";
import { claudeOrchestrationAdapter } from "./claude-seam";

// Registered orchestration seams. Claude is the reference implementation;
// codex/gemini/grok/openclaw register here as their seams are implemented.
// node-only (the claude seam pulls in fs) — do NOT re-export via the
// orchestration barrel; import `adapterFor` directly from node handlers.
const SEAMS: Partial<Record<AdapterId, OrchestrationSeam>> = {
  claude: claudeOrchestrationAdapter,
};

/**
 * Resolve the orchestration seam for an adapter, or `undefined` when none is
 * registered. Call sites use `adapterFor(id)?.hook?.(…) ?? <neutral fallback>`
 * so an absent adapter/hook reproduces today's neutral behavior.
 */
export function adapterFor(id: AdapterId): OrchestrationSeam | undefined {
  return SEAMS[id];
}
