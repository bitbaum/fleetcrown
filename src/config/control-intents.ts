import { type OrchestrationTaskIntentId } from "@/lib/orchestration";

type IntentGroup = "primary" | "action" | "more";

// UI presentation config for control-panel intent buttons.
// Only intents shown as group buttons are listed here.
// Keys must exist in ORCHESTRATION_INTENTS — TypeScript enforces this.
const INTENT_UI: Partial<Record<OrchestrationTaskIntentId, { label: string; group: IntentGroup }>> =
  {
    next_best: { label: "Next best", group: "primary" },
    test_and_fix: { label: "Test & fix", group: "action" },
    quality: { label: "Quality", group: "action" },
    commit_push: { label: "Commit", group: "action" },
    full_audit: { label: "Full audit", group: "more" },
    product: { label: "Product review", group: "more" },
    ux_review: { label: "UX review", group: "more" },
    deploy_check: { label: "Deploy check", group: "more" },
    close_session: { label: "Close session", group: "more" },
    hard_stop: { label: "Hard stop", group: "more" },
  };

type IntentButton = { id: OrchestrationTaskIntentId; label: string };

function byGroup(group: IntentGroup): IntentButton[] {
  return Object.entries(INTENT_UI)
    .filter(([, v]) => v!.group === group)
    .map(([id, v]) => ({ id: id as OrchestrationTaskIntentId, label: v!.label }));
}

export const PRIMARY_INTENTS: IntentButton[] = byGroup("primary");
export const ACTION_INTENTS: IntentButton[] = byGroup("action");
export const MORE_INTENTS: IntentButton[] = byGroup("more");

export function getIntentLabel(id: string): string {
  const entry = INTENT_UI[id as OrchestrationTaskIntentId];
  return entry?.label ?? id.replace(/_/g, " ");
}

export function getAdapterLabel(adapter: string): string {
  if (adapter === "openclaw") return "OpenClaw";
  return adapter.charAt(0).toUpperCase() + adapter.slice(1);
}
