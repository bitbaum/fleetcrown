"use client";

import { cn } from "@/lib/utils";
import { FEEDBACK_WORK_PHASE, type FeedbackWorkView } from "@/lib/feedback/work-phase";

/** Honest status chip for feedback work — never says "dispatched". */
export function FeedbackWorkBadge({ work }: { work: FeedbackWorkView }) {
  const tone =
    work.phase === FEEDBACK_WORK_PHASE.WORKING
      ? "ui-tag-positive"
      : work.phase === FEEDBACK_WORK_PHASE.DONE
        ? "ui-tag-positive"
        : work.phase === FEEDBACK_WORK_PHASE.FAILED || work.phase === FEEDBACK_WORK_PHASE.STUCK
          ? "ui-tag-negative"
          : work.phase === FEEDBACK_WORK_PHASE.QUEUED
            ? "ui-tag-warning"
            : "ui-tag";

  return (
    <span className={cn(tone, "shrink-0")} title={work.detail ?? work.label}>
      {work.label}
    </span>
  );
}
