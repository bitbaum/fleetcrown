import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OrchestrationOutcome } from "@/db/schema/orchestration-runs";

const OUTCOME_GLYPH: Record<OrchestrationOutcome, string> = {
  success: "✓",
  partial: "~",
  error: "✗",
  hang: "✗",
  timeout: "✗",
  user_abort: "✕",
};

const OUTCOME_TONE: Record<OrchestrationOutcome, string> = {
  success: "ui-tag-positive",
  partial: "ui-tag-warning",
  error: "ui-tag-negative",
  hang: "ui-tag-negative",
  timeout: "ui-tag-negative",
  user_abort: "ui-tag-warning",
};

const OUTCOME_LABEL: Record<OrchestrationOutcome, string> = {
  success: "succeeded",
  partial: "partial",
  error: "errored",
  hang: "hung",
  timeout: "timed out",
  user_abort: "aborted",
};

/**
 * Compact 5-glyph row visualising the last N outcomes of an orchestration run,
 * newest first. Powers the autonomy feedback loop on the control panel.
 *
 * When projectKey is provided the streak links to Activity filtered to that
 * project — a failure signal must lead to its cause. Six unexplained,
 * unclickable red ✗ was the only honest surface during the 2026-07-02
 * dead-fleet incident, and it was a dead end.
 */
export function OutcomeStreak({
  outcomes,
  projectKey,
  className,
}: {
  outcomes: OrchestrationOutcome[];
  /** Control project key — enables the deep link into Activity. */
  projectKey?: string;
  className?: string;
}) {
  if (!outcomes || outcomes.length === 0) return null;

  const glyphs = outcomes.map((o, i) => (
    <span
      key={i}
      className={cn(OUTCOME_TONE[o], "min-w-5 px-1.5 py-0 text-center text-micro tracking-tight")}
      title={`${i === 0 ? "latest" : `${i + 1} runs ago`}: ${OUTCOME_LABEL[o]}`}
    >
      {OUTCOME_GLYPH[o]}
    </span>
  ));

  if (!projectKey) {
    return (
      <span className={cn("flex items-center gap-1", className)} aria-label="Recent run outcomes">
        {glyphs}
      </span>
    );
  }

  return (
    <Link
      href={`/activity?window=week&project=${encodeURIComponent(projectKey)}`}
      className={cn("ui-tap flex items-center gap-1 rounded transition-opacity hover:opacity-75", className)}
      aria-label={`Recent run outcomes for ${projectKey} — open in Activity`}
      title="Recent run outcomes — click to review in Activity"
    >
      {glyphs}
    </Link>
  );
}
