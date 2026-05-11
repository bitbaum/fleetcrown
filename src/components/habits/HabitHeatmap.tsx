"use client";

import { type HabitFrequency, isHabitScheduled } from "@/lib/constants/statuses";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";
import { toLocalDateStr } from "@/lib/dates";

/** Generate last N calendar dates as YYYY-MM-DD, oldest first */
function lastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

export function HabitHeatmap({
  completedDates,
  frequency,
}: {
  completedDates: string[];
  frequency: HabitFrequency;
}) {
  const done = new Set(completedDates);
  const dates = lastNDates(HABIT_HISTORY_DAYS);

  return (
    <div className="flex gap-0.5 flex-wrap">
      {dates.map((date) => {
        const due = isHabitScheduled(frequency, new Date(date + "T12:00:00").getDay());
        const completed = done.has(date);
        const isToday = date === dates[dates.length - 1];

        let title = date;
        if (!due) title += " (not due)";
        else if (completed) title += " ✓";

        return (
          <div
            key={date}
            title={title}
            className={[
              "h-3.5 w-3.5 rounded-sm flex-shrink-0",
              isToday ? "ring-1 ring-white/30" : "",
              !due
                ? "bg-surface-base"
                : completed
                  ? "bg-status-positive/50"
                  : "bg-surface-overlay",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
