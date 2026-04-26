import { Repeat2, Flame } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getAllHabitsWithHistory } from "@/db/queries/habits";
import { HabitHeatmap } from "@/components/habits/HabitHeatmap";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";

export default async function HabitsPage() {
  const habits = await getAllHabitsWithHistory(HABIT_HISTORY_DAYS);
  const active = habits.filter((h) => h.active);
  const totalCompletions = habits.reduce((s, h) => s + h.completionsInWindow, 0);
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);

  return (
    <PageLayout
      title="Habits"
      subtitle={`${HABIT_HISTORY_DAYS}-day history — consistency compounds`}
    >
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Habits" value={String(active.length)} sub={`${habits.length} total`} />
        <StatCard label={`Completions (${HABIT_HISTORY_DAYS}d)`} value={String(totalCompletions)} sub="across all habits" />
        <StatCard label="Best Streak" value={bestStreak > 0 ? `${bestStreak}d` : "—"} sub="current longest" />
      </div>

      {habits.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-white/30">
            <Repeat2 className="h-10 w-10" />
            <div className="text-sm">No habits tracked yet</div>
            <div className="text-xs text-center">
              Add habits from the Today page to start tracking.
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => {
            const pct = Math.round((h.completionsInWindow / HABIT_HISTORY_DAYS) * 100);

            return (
              <Card key={h.id} className={h.active ? "" : "opacity-50"}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm md:text-base font-medium">{h.title}</span>
                      {!h.active && (
                        <span className="text-xs text-white/25 border border-white/10 rounded px-1.5 py-0.5">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-white/35">{h.frequency}</span>
                      {h.streak >= 2 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-400/70">
                          <Flame className="h-3 w-3" />
                          {h.streak}-day streak
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium">{pct}%</div>
                    <div className="text-xs text-white/30">{h.completionsInWindow}/{HABIT_HISTORY_DAYS}d</div>
                  </div>
                </div>
                <HabitHeatmap
                  completedDates={[...h.completedDates]}
                  frequency={h.frequency}
                />
              </Card>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
