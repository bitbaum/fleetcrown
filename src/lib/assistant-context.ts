/**
 * Page → assistant context bridge (client-side). The page that knows its
 * subject (today: the project profile) publishes a small context object; the
 * floating assistant subscribes and turns it into concrete, page-aware
 * proposals. One module-level store + event, same pattern as fleet-context.
 */

export type AssistantProjectContext = {
  projectId: string;
  name: string;
  workspaceKey: string;
  /** Open attention items, verbatim from the profile. */
  signals: Array<{ key: string; label: string; value: string }>;
  nextStep: string | null;
  /** Consecutive most-recent finished runs that timed out. */
  timeoutStreak: number;
  readonly: boolean;
};

export const ASSISTANT_CONTEXT_EVENT = "fleetcrown:assistant-context";

let current: AssistantProjectContext | null = null;

export function setAssistantContext(ctx: AssistantProjectContext | null): void {
  current = ctx;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ASSISTANT_CONTEXT_EVENT));
  }
}

export function readAssistantContext(): AssistantProjectContext | null {
  return current;
}

export function subscribeAssistantContext(onChange: () => void): () => void {
  window.addEventListener(ASSISTANT_CONTEXT_EVENT, onChange);
  return () => window.removeEventListener(ASSISTANT_CONTEXT_EVENT, onChange);
}
