/**
 * What the PERSON WHO FILED a report is told about it.
 *
 * This is a deliberate narrowing, not a second status model. `work-phase.ts`
 * answers the operator's question — "is anything waiting on me?" — in operator
 * vocabulary: stuck, failed, needs verify, a run diagnostic, a pull request
 * number. Every one of those is either meaningless or actively wrong to show a
 * stranger who typed a sentence into a widget on someone else's website:
 *
 *   • "Failed" reads as "they gave up on me". The honest thing a reporter
 *     needs to know is that it is still open, which is true and is all they
 *     can act on.
 *   • A run's raw error is an engineer's note to another engineer, and it can
 *     name internal services, branches and paths belonging to the operator's
 *     product. It never crosses this boundary.
 *   • A pull request number is not a fact about the reporter's report.
 *
 * So: one four-rung ladder, written for a human who does not work here, with
 * the operator's detail left on the operator's side of the wall.
 *
 * The one honesty rule inherited unchanged from work-phase: SHIPPED means the
 * live product changed. An agent run closing is not shipped, a merged pull
 * request is not shipped. Anything short of the operator's Resolve reads as
 * "on the way", because telling a reporter their fix is live when it is not is
 * the single worst thing this page could do.
 */
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";
import { FEEDBACK_WORK_PHASE, type FeedbackWorkView } from "@/lib/feedback/work-phase";
import { firstSentence } from "@/lib/feedback/fix-shipping";

export const PUBLIC_FEEDBACK_STEP = {
  RECEIVED: "received",
  WORKING: "working",
  ON_THE_WAY: "on_the_way",
  SHIPPED: "shipped",
  CLOSED: "closed",
} as const;
export type PublicFeedbackStep = (typeof PUBLIC_FEEDBACK_STEP)[keyof typeof PUBLIC_FEEDBACK_STEP];

/** The rungs drawn as a progress ladder, in order. CLOSED is deliberately not
 *  on it — an archived report left the ladder rather than finishing it. */
export const PUBLIC_FEEDBACK_LADDER = [
  PUBLIC_FEEDBACK_STEP.RECEIVED,
  PUBLIC_FEEDBACK_STEP.WORKING,
  PUBLIC_FEEDBACK_STEP.ON_THE_WAY,
  PUBLIC_FEEDBACK_STEP.SHIPPED,
] as const;

export const PUBLIC_STEP_LABEL: Record<PublicFeedbackStep, string> = {
  received: "Received",
  working: "Being worked on",
  on_the_way: "Fix on the way",
  shipped: "Shipped",
  closed: "Closed",
};

export type PublicFeedbackStatus = {
  step: PublicFeedbackStep;
  /** Position on the ladder above, or -1 for CLOSED (off the ladder). */
  rung: number;
  /** The word on the badge. */
  label: string;
  /** One line addressed to the reporter, second person, no jargon. */
  detail: string;
  /** The reporter's report is finished with, one way or another. */
  settled: boolean;
};

/**
 * Operator phase → reporter status.
 *
 * Exhaustive over FEEDBACK_WORK_PHASE by construction (the switch returns in
 * every arm and TypeScript checks the union), so a phase added later cannot
 * silently fall through to a friendly default that overstates progress.
 */
export function publicFeedbackStatus(
  status: FeedbackStatus,
  work: FeedbackWorkView,
): PublicFeedbackStatus {
  const step = stepFor(status, work);
  return {
    step,
    rung: PUBLIC_FEEDBACK_LADDER.indexOf(step as (typeof PUBLIC_FEEDBACK_LADDER)[number]),
    label: PUBLIC_STEP_LABEL[step],
    detail: detailFor(step, work),
    settled: step === PUBLIC_FEEDBACK_STEP.SHIPPED || step === PUBLIC_FEEDBACK_STEP.CLOSED,
  };
}

function stepFor(status: FeedbackStatus, work: FeedbackWorkView): PublicFeedbackStep {
  // Resolved is the only road to Shipped, and it is the DB status that says so
  // — not a phase derived from a run. Checked first so no run state can
  // outvote the operator's own act.
  if (status === FEEDBACK_STATUS.RESOLVED) return PUBLIC_FEEDBACK_STEP.SHIPPED;
  if (status === FEEDBACK_STATUS.ARCHIVED) return PUBLIC_FEEDBACK_STEP.CLOSED;

  switch (work.phase) {
    case FEEDBACK_WORK_PHASE.DONE:
      return PUBLIC_FEEDBACK_STEP.SHIPPED;
    case FEEDBACK_WORK_PHASE.ARCHIVED:
      return PUBLIC_FEEDBACK_STEP.CLOSED;
    case FEEDBACK_WORK_PHASE.NEEDS_VERIFY:
      return PUBLIC_FEEDBACK_STEP.ON_THE_WAY;
    case FEEDBACK_WORK_PHASE.QUEUED:
    case FEEDBACK_WORK_PHASE.WORKING:
      return PUBLIC_FEEDBACK_STEP.WORKING;
    // A first attempt that stalled or failed is not a rung the reporter
    // climbed. It is still an open report and nothing about the failure is
    // theirs to act on, so it reads exactly like one.
    case FEEDBACK_WORK_PHASE.STUCK:
    case FEEDBACK_WORK_PHASE.FAILED:
    case FEEDBACK_WORK_PHASE.NOT_STARTED:
      return PUBLIC_FEEDBACK_STEP.RECEIVED;
  }
}

function detailFor(step: PublicFeedbackStep, work: FeedbackWorkView): string {
  switch (step) {
    case PUBLIC_FEEDBACK_STEP.RECEIVED:
      return work.phase === FEEDBACK_WORK_PHASE.STUCK || work.phase === FEEDBACK_WORK_PHASE.FAILED
        ? "A first attempt at this one didn't land. It's still open."
        : "It's on the list. Nobody has started on it yet.";
    case PUBLIC_FEEDBACK_STEP.WORKING:
      return "Someone is working on this right now.";
    case PUBLIC_FEEDBACK_STEP.ON_THE_WAY:
      return "A change has been written for this and is on its way to the live site.";
    case PUBLIC_FEEDBACK_STEP.SHIPPED:
      return "This went live. Thanks for reporting it.";
    case PUBLIC_FEEDBACK_STEP.CLOSED:
      return "This one was closed without a change.";
  }
}

/**
 * The one-line account of what was actually built, if the reporter may see it.
 *
 * Two gates, because this string is written by an agent working inside the
 * OPERATOR's product and can name their branches, files and services:
 *
 *  1. Only once the row is SHIPPED. Resolve is a deliberate human act on the
 *     row, which is the closest thing to review this text ever gets.
 *  2. URLs stripped and one sentence only. A pull request link is internal, and
 *     the handoff's later sentences are where the repo detail tends to live.
 *
 * Returns null when there is nothing publishable — the page then says only
 * that it shipped, which is the part the reporter asked about anyway.
 */
export function publicDidLine(
  step: PublicFeedbackStep,
  didLine: string | null | undefined,
): string | null {
  if (step !== PUBLIC_FEEDBACK_STEP.SHIPPED) return null;
  const stripped = (didLine ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // Left with a fragment once the links are gone — not worth showing.
  if (stripped.length < 12) return null;
  return firstSentence(stripped, 180);
}
