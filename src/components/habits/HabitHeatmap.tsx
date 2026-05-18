"use client";

import { type HabitFrequency, isHabitScheduled } from "@/lib/constants/statuses";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";
import { toLocalDateStr } from "@/lib/dates";

// Mon-first row order: row 0=Mon(1)…row 5=Sat(6), row 6=Sun(0)
const ROW_TO_DOW = [1, 2, 3, 4, 5, 6, 0] as const;
const ROW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function lastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}

/** Convert JS getDay() (0=Sun) to Mon-first row index (0=Mon…6=Sun) */
function dowToRow(dow: number): number {
  return dow === 0 ? 6 : dow - 1;
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
  const today = dates[dates.length - 1];

  // Row of the first date in the Mon-first grid
  const firstDateRow = dowToRow(new Date(dates[0] + "T12:00:00").getDay());
  const numCols = Math.ceil((firstDateRow + HABIT_HISTORY_DAYS) / 7);

  return (
    <div className="flex items-start gap-1">
      {/* Day-of-week labels */}
      <div className="flex flex-col gap-0.5 shrink-0">
        {ROW_LABELS.map((label, i) => (
          <div key={i} className="h-3.5 w-3 flex items-center justify-end text-nano text-text-muted leading-none">
            {i % 2 === 0 ? label : ""}
          </div>
        ))}
      </div>

      {/* Week columns, oldest left → newest right */}
      <div className="flex gap-0.5">
        {Array.from({ length: numCols }, (_, col) => (
          <div key={col} className="flex flex-col gap-0.5">
            {ROW_LABELS.map((_, row) => {
              const dateIdx = col * 7 + row - firstDateRow;
              if (dateIdx < 0 || dateIdx >= HABIT_HISTORY_DAYS) {
                return <div key={row} className="h-3.5 w-3.5 rounded-sm" />;
              }
              const date = dates[dateIdx];
              const due = isHabitScheduled(frequency, ROW_TO_DOW[row]);
              const completed = done.has(date);
              const isToday = date === today;

              let title = date;
              if (!due) title += " (not due)";
              else if (completed) title += " ✓";

              return (
                <div
                  key={row}
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
        ))}
      </div>
    </div>
  );
}
