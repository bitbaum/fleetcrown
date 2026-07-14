import { ORCHESTRATION_OUTCOME, type OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import type { OrchestrationTaskSummary } from "./contract";
import { SESSION_STATUS } from "@/lib/constants/statuses";

export type InferOutcomeInput = {
  summary?: OrchestrationTaskSummary | null;
  durationMs?: number;
  error?: string | null;
  userAbort?: boolean;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

function contains(haystack: string | undefined | null, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

function hasFailedTests(tests: string | undefined | null): boolean {
  if (!tests) return false;
  const t = tests.toLowerCase();
  // "3/5 pass" style — fewer pass than total
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[1]) < Number(m[2])) return true;
  // Preserve reports such as "12 pass - 0 fail" as successful.
  const explicitFailureCount = t.match(/\b(\d+)\s*fail(?:ed|ures?)?\b/);
  if (explicitFailureCount) return Number(explicitFailureCount[1]) > 0;
  return /\bfail(?:ed|ures?)?\b/.test(t);
}

export function inferOutcome(input: InferOutcomeInput): OrchestrationOutcome {
  const { summary, durationMs, error, userAbort } = input;

  if (userAbort) return ORCHESTRATION_OUTCOME.USER_ABORT;
  if (error || contains(summary?.health, "critical") || contains(summary?.tsc, "fail")) return ORCHESTRATION_OUTCOME.ERROR;

  // No handoff written + ran long → hung
  if (!summary?.done && typeof durationMs === "number" && durationMs > THIRTY_MINUTES_MS) {
    return ORCHESTRATION_OUTCOME.HANG;
  }

  if (hasFailedTests(summary?.tests) || contains(summary?.lint, "fail") || contains(summary?.health, "needs attention")) {
    return ORCHESTRATION_OUTCOME.PARTIAL;
  }

  if ((contains(summary?.health, "good") || summary?.status?.toLowerCase() === SESSION_STATUS.READY) && summary?.done) {
    return ORCHESTRATION_OUTCOME.SUCCESS;
  }

  // Default — work happened but signal is weak
  return ORCHESTRATION_OUTCOME.PARTIAL;
}
