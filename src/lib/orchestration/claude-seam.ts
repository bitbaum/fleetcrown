import type { OrchestrationSeam } from "./contract";
import { ADAPTER_DEFINITIONS } from "./adapters";
import { collectRuntimeLifecycleEvents } from "./state";
import { closeRunFromSession } from "./close-from-session";
import { buildPromptWithSession } from "@/lib/agent-config";

/**
 * Claude orchestration seam — binds the existing Claude-specific lifecycle,
 * session-close, and prompt-enrichment logic behind the neutral adapter
 * interface. Behavior is IDENTICAL to the prior bare-function calls; this only
 * relocates the references so other adapters can implement the same hooks.
 *
 * node-only: transitively imports agent-config (fs). Reach it via the registry
 * (`adapterFor`) from node route handlers only — never edge/SSR bundles, and
 * not through the orchestration barrel.
 */
export const claudeOrchestrationAdapter: OrchestrationSeam = {
  id: "claude",
  label: ADAPTER_DEFINITIONS.claude.label,
  capabilities: ADAPTER_DEFINITIONS.claude.capabilities,
  collectLifecycleEvents: collectRuntimeLifecycleEvents,
  closeRunFromSession,
  enrichPrompt: buildPromptWithSession,
};
