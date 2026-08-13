import { ORCHESTRATION_OUTCOME } from "@/db/schema/orchestration-runs";
import type { OrchestrationRun } from "@/db/schema/orchestration-runs";

/** Longest summary/error excerpt a close notification carries into chat. */
const SUMMARY_MAX_CHARS = 600;

/**
 * Pure half of the chat close notification (see notify-close.ts): decide
 * whether this run notifies and what the message says. Returns null for runs
 * that didn't opt in (or that aren't actually closed) so the caller can skip
 * the send entirely. Kept free of infra imports (no db, no fetch) so
 * scripts/test/notify-close.ts can cover it without a database.
 */
export function formatRunCloseMessage(
  run: Pick<OrchestrationRun, "projectKey" | "outcome" | "finishedAt" | "payload">,
): string | null {
  if (!run.payload?.notifyOnClose || !run.finishedAt) return null;
  const ok = run.outcome === ORCHESTRATION_OUTCOME.SUCCESS;
  const icon = ok ? "✅" : run.outcome === ORCHESTRATION_OUTCOME.PARTIAL ? "🟡" : "❌";
  const summary = run.payload?.resultText?.trim() || run.payload?.error?.trim() || "";
  const lines = [
    `${icon} ${run.projectKey}: run ${run.outcome ?? "closed"}`,
    ...(summary ? [summary.slice(0, SUMMARY_MAX_CHARS)] : []),
  ];
  return lines.join("\n");
}
