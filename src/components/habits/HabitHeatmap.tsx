"use client";

import { HABIT_FREQUENCY } from "@/lib/constants/statuses";

const DAYS = 30;

/** Generate last N calendar dates as YYYY-MM-DD, oldest first */
function lastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

/** Whether a date (YYYY-MM-DD) is a day the habit is due */
function isDue(dateStr: string, frequency: string): boolean {
  const d = new Date(dateStr + "T12:00:00"); // noon avoids DST edge cases
  const dow = d.getDay();
  if (frequency === HABIT_FREQUENCY.WEEKDAYS) return dow >= 1 && dow <= 5;
  if (frequency === HABIT_FREQUENCY.WEEKLY)   return dow === 1;
  return true;
}

export function HabitHeatmap({
  completedDates,
  frequency,
}: {
  completedDates: string[];
  frequency: string;
}) {
  const done = new Set(completedDates);
  const dates = lastNDates(DAYS);

  return (
    <div className="flex gap-0.5 flex-wrap">
      {dates.map((date) => {
        const due = isDue(date, frequency);
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
                ? "bg-white/[0.03]"
                : completed
                  ? "bg-emerald-500/80"
                  : "bg-white/[0.08]",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}
