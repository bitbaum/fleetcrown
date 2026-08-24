import { ORCHESTRATION_OUTCOME } from "@/db/schema/orchestration-runs";
import type { OrchestrationRun } from "@/db/schema/orchestration-runs";

/** Longest summary/error excerpt a close notification carries into chat. */
const SUMMARY_MAX_CHARS = 600;
const PUSH_BODY_MAX_CHARS = 240;

/**
 * Pure half of the close notification (see notify-close.ts): decide whether
 * this run notifies and what the message says. Returns null for runs that
 * didn't opt in (or that aren't actually closed) so the caller can skip the
 * send entirely. Kept free of infra imports (no db, no fetch) so
 * scripts/test/notify-close.ts can cover it without a database.
 *
 * Opt-in is for captain-initiated work (Control, Loki, Implement, Install).
 * Autopilot / idle-nudge stays silent so fleet churn never spams the phone.
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

/** Web-push title/body for the same opt-in. URL/tag live in notify-close.ts. */
export function formatRunClosePush(
  run: Pick<OrchestrationRun, "projectKey" | "outcome" | "finishedAt" | "payload">,
): { title: string; body: string } | null {
  if (!run.payload?.notifyOnClose || !run.finishedAt) return null;
  const outcome = run.outcome ?? "closed";
  const title =
    outcome === ORCHESTRATION_OUTCOME.SUCCESS
      ? `${run.projectKey} · done`
      : outcome === ORCHESTRATION_OUTCOME.PARTIAL
        ? `${run.projectKey} · follow-up`
        : `${run.projectKey} · failed`;
  const summary =
    run.payload?.resultText?.trim() || run.payload?.error?.trim() || `Run ${outcome}`;
  return { title, body: summary.slice(0, PUSH_BODY_MAX_CHARS) };
}
