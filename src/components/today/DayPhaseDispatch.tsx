"use client";

import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import { EVENING_FROM_HOUR, PLAN_DAY_PROMPT, WRAP_UP_PROMPT } from "@/lib/constants/today";
import { useLocalNow } from "@/hooks/use-local-now";

/**
 * "Plan my day" in the morning, "Wrap up day" in the evening — decided by the
 * READER's clock.
 *
 * /today used to branch on `new Date().getHours()` in the server component. The
 * box runs UTC, so between 17:00 and 19:00 local a Zurich user was offered
 * "Plan my day" — two hours a day of the wrong affordance, every day, with
 * nothing in the UI to hint the page had guessed. Same root cause as the
 * greeting's hydration error: only the browser knows what time it is for the
 * person reading.
 *
 * Before the clock is known, planning is the safe default: it is the action
 * that still makes sense at any hour, whereas offering an end-of-day review at
 * 9am is nonsense.
 */
export function DayPhaseDispatch() {
  const now = useLocalNow();
  const isEvening = now !== null && now.getHours() >= EVENING_FROM_HOUR;

  return isEvening ? (
    <LokiDispatchButton
      prompt={WRAP_UP_PROMPT}
      label="Wrap up day"
      title="Ask Loki to run your end-of-day review"
      className="ui-btn-pill-positive"
    />
  ) : (
    <LokiDispatchButton
      prompt={PLAN_DAY_PROMPT}
      label="Plan my day"
      title="Ask Loki to plan your day"
      className="ui-btn-pill-positive"
    />
  );
}
