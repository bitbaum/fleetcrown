import { type OrchestrationTaskIntentId } from "@/lib/orchestration";

type IntentGroup = "primary" | "action" | "more";

// UI presentation config for control-panel intent buttons.
// Only intents shown as group buttons are listed here.
// Keys must exist in ORCHESTRATION_INTENTS — TypeScript enforces this.
//
// WHICH GROUP AN INTENT BELONGS IN IS A USAGE QUESTION, AND WE HAVE THE USAGE.
//
// Counted over the whole history of orchestration_runs (2026-09-04):
//
//   next_best     185 runs      <- primary, and it earns it
//   custom         99 runs
//   test_and_fix    3 runs      <- of which 2 are seed rows
//   quality         1 run       <- a seed row
//   commit_push     0 runs      <- never once, by anyone
//
// The three "action" chips sat directly under the primary CTA on every project
// card at every width above `sm`. Between them they have ONE real dispatch in
// the product's entire history — Bitbaum/test_and_fix on 2026-07-31, which
// ended `error/timeout`. The other five rows were inserted at 04:20:02.844
// through .850 — five rows inside six milliseconds, on projects (ledgerpost,
// harbourlight, kestrel) that are not in the fleet. That is a seed script, not
// a person.
//
// So they move to `more`, behind the disclosure that already exists and already
// hid them below `sm`. Nothing is removed: every intent is still one tap away,
// and a rarely-used action one tap deeper is a fair trade for a card that opens
// with the one action that is actually used. This is what CLAUDE.md asks of
// this surface — "at most one button" — applied with numbers instead of taste.
//
// If usage changes, move them back. The counts are the argument, not the layout.
const INTENT_UI: Partial<Record<OrchestrationTaskIntentId, { label: string; group: IntentGroup }>> =
  {
    next_best: { label: "Next best", group: "primary" },
    test_and_fix: { label: "Test & fix", group: "more" },
    quality: { label: "Quality", group: "more" },
    commit_push: { label: "Commit", group: "more" },
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
