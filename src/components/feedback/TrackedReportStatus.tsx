import { cn } from "@/lib/utils";
import {
  PUBLIC_FEEDBACK_LADDER,
  PUBLIC_FEEDBACK_STEP,
  PUBLIC_STEP_LABEL,
  type PublicFeedbackStatus,
} from "@/lib/feedback/public-status";

/**
 * The reporter-facing status ladder, shared by the public /f/<token> page and
 * the Sent list in the app. One component so the two can never disagree about
 * what a report's state looks like — a person who follows a link and then signs
 * in is looking at the same report twice, and a second shape would read as a
 * second state.
 *
 * Renders only what `publicFeedbackStatus` produced. It never reaches for the
 * operator's work view, which is exactly the leak this whole layer exists to
 * prevent.
 */
export function TrackedReportStatus({
  status,
  className,
}: {
  status: PublicFeedbackStatus;
  className?: string;
}) {
  const closed = status.step === PUBLIC_FEEDBACK_STEP.CLOSED;
  return (
    <div className={className}>
      <div className="ui-track-ladder" aria-hidden>
        {PUBLIC_FEEDBACK_LADDER.map((rung, i) => (
          <div
            key={rung}
            className={cn(
              "ui-track-rung",
              closed && "ui-track-rung-closed",
              !closed && i < status.rung && "ui-track-rung-done",
              !closed && i === status.rung && "ui-track-rung-current",
            )}
          />
        ))}
      </div>
      {/* The ladder above is decorative; this line is the accessible status. */}
      <div className="ui-track-step-row">
        <span className="ui-track-step-label">{status.label}</span>
        <span className="ui-track-meta">
          {closed
            ? "Closed"
            : `Step ${status.rung + 1} of ${PUBLIC_FEEDBACK_LADDER.length} · ${
                PUBLIC_STEP_LABEL[PUBLIC_FEEDBACK_LADDER[PUBLIC_FEEDBACK_LADDER.length - 1]]
              } is the last`}
        </span>
      </div>
      <p className="ui-track-step-detail mt-1.5">{status.detail}</p>
    </div>
  );
}
