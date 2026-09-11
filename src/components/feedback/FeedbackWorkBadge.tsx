"use client";

import { cn } from "@/lib/utils";
import { FEEDBACK_WORK_PHASE, type FeedbackWorkView } from "@/lib/feedback/work-phase";
import { FIX_SHIP_STATE } from "@/lib/feedback/fix-shipping";

/** Honest status chip for feedback work — never says "dispatched". */
export function FeedbackWorkBadge({ work }: { work: FeedbackWorkView }) {
  // Deployed reads green like Done — the product changed; the operator only
  // confirms. Everything else on the way (PR open, merged, deploying) is amber.
  const deployed =
    work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY && work.ship?.state === FIX_SHIP_STATE.DEPLOYED;
  const tone =
    work.phase === FEEDBACK_WORK_PHASE.WORKING || deployed
      ? "ui-tag-positive"
      : work.phase === FEEDBACK_WORK_PHASE.DONE
        ? "ui-tag-positive"
        : work.phase === FEEDBACK_WORK_PHASE.FAILED || work.phase === FEEDBACK_WORK_PHASE.STUCK
          ? "ui-tag-negative"
          : work.phase === FEEDBACK_WORK_PHASE.QUEUED ||
              work.phase === FEEDBACK_WORK_PHASE.NEEDS_VERIFY
            ? "ui-tag-warning"
            : "ui-tag";

  return (
    <span className={cn(tone, "shrink-0")} title={work.detail ?? work.label}>
      {work.label}
    </span>
  );
}
