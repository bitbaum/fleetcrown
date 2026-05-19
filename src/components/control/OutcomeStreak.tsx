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
 */
export function OutcomeStreak({
  outcomes,
  className,
}: {
  outcomes: OrchestrationOutcome[];
  className?: string;
}) {
  if (!outcomes || outcomes.length === 0) return null;

  return (
    <span className={cn("flex items-center gap-1", className)} aria-label="Recent run outcomes">
      {outcomes.map((o, i) => (
        <span
          key={i}
          className={cn(OUTCOME_TONE[o], "min-w-5 px-1.5 py-0 text-center text-micro tracking-tight")}
          title={`${i === 0 ? "latest" : `${i + 1} runs ago`}: ${OUTCOME_LABEL[o]}`}
        >
          {OUTCOME_GLYPH[o]}
        </span>
      ))}
    </span>
  );
}
