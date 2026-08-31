import { ORCHESTRATION_OUTCOME, type OrchestrationOutcome } from "@/db/schema/orchestration-runs";
import type { OrchestrationTaskSummary } from "./contract";
import { SESSION_STATUS } from "@/lib/constants/statuses";
import { MINUTE_MS } from "@/lib/constants/time";

export type InferOutcomeInput = {
  summary?: OrchestrationTaskSummary | null;
  durationMs?: number;
  error?: string | null;
  userAbort?: boolean;
};

const THIRTY_MINUTES_MS = 30 * MINUTE_MS;

function contains(haystack: string | undefined | null, needle: string): boolean {
  return !!haystack && haystack.toLowerCase().includes(needle);
}

/**
 * The verdict clause of a handoff field — everything before the first em-dash
 * or sentence break.
 *
 * Handoff fields are written as `<verdict> — <explanation>`, and since the
 * autopilot prompt started asking agents to explain checks they could not run
 * (HANDOFF_CLOSE_CONTRACT, 2026-08-02) those explanations are full prose. The
 * bare-word failure sniff below must read only the claim, never the reasoning:
 * solon reported `tests: no suite — manually verified …; the failure occurs
 * before signature verification runs`, and matching "failure" inside that
 * explanation marked a healthy run as having failing tests — which skipped the
 * DoD gate entirely, since the gate only ever grades a SUCCESS close.
 * Rewarding honesty with a misread verdict teaches agents to write less.
 */
function verdictClause(text: string): string {
  return text.split(/\s+[—–-]\s+|[.;]\s/)[0] ?? text;
}

function hasFailedTests(tests: string | undefined | null): boolean {
  if (!tests) return false;
  const t = tests.toLowerCase();
  // "3/5 pass" style — fewer pass than total. Counts are unambiguous evidence,
  // so they are read from the WHOLE field wherever they appear.
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[1]) < Number(m[2])) return true;
  // Preserve reports such as "12 pass - 0 fail" as successful.
  const explicitFailureCount = t.match(/\b(\d+)\s*fail(?:ed|ures?)?\b/);
  if (explicitFailureCount) return Number(explicitFailureCount[1]) > 0;
  // "no suite" / "no tests" is an absence, not a failure. It is exactly what
  // the close contract asks an agent to write instead of staying silent, and
  // the DoD judge — not this heuristic — is what decides whether an absent
  // suite meets the project's bar.
  if (/\bno (?:test )?suite\b|\bno tests\b/.test(t)) return false;
  // Bare word, verdict clause only — never the explanation that follows.
  return /\bfail(?:ed|ures?|ing)?\b/.test(verdictClause(t));
}

export function inferOutcome(input: InferOutcomeInput): OrchestrationOutcome {
  const { summary, durationMs, error, userAbort } = input;

  if (userAbort) return ORCHESTRATION_OUTCOME.USER_ABORT;
  if (error || contains(summary?.health, "critical") || contains(summary?.tsc, "fail"))
    return ORCHESTRATION_OUTCOME.ERROR;

  // No handoff written + ran long → hung
  if (!summary?.done && typeof durationMs === "number" && durationMs > THIRTY_MINUTES_MS) {
    return ORCHESTRATION_OUTCOME.HANG;
  }

  if (
    hasFailedTests(summary?.tests) ||
    contains(summary?.lint, "fail") ||
    contains(summary?.health, "needs attention")
  ) {
    return ORCHESTRATION_OUTCOME.PARTIAL;
  }

  if (
    (contains(summary?.health, "good") ||
      summary?.status?.toLowerCase() === SESSION_STATUS.READY) &&
    summary?.done
  ) {
    return ORCHESTRATION_OUTCOME.SUCCESS;
  }

  // Default — work happened but signal is weak
  return ORCHESTRATION_OUTCOME.PARTIAL;
}
