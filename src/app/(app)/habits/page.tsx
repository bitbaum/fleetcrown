import { Repeat2, Flame } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getAllHabitsWithHistory } from "@/db/queries/habits";
import { getCurrentUserId } from "@/lib/session";
import { HabitHeatmap } from "@/components/habits/HabitHeatmap";
import { AddHabitButton } from "@/components/habits/AddHabitButton";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";

export default async function HabitsPage() {
  const userId = await getCurrentUserId();
  const habits = await getAllHabitsWithHistory(userId, HABIT_HISTORY_DAYS);
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
          <div className="flex flex-col items-center gap-4 py-10 text-text-secondary">
            <Repeat2 className="h-10 w-10" />
            <div className="text-lg">No habits tracked yet</div>
            <AddHabitButton emptyState />
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
                      <span className="text-lg font-medium text-text-primary">{h.title}</span>
                      {!h.active && (
                        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-sm text-text-tertiary">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-sm text-text-secondary">{h.frequency}</span>
                      {h.streak >= 2 && (
                        <span className="flex items-center gap-1 text-sm text-status-warning">
                          <Flame className="h-3 w-3" />
                          {h.streak}-day streak
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-medium text-text-primary">{pct}%</div>
                    <div className="text-sm text-text-tertiary">{h.completionsInWindow}/{HABIT_HISTORY_DAYS}d</div>
                  </div>
                </div>
                <HabitHeatmap
                  completedDates={[...h.completedDates]}
                  frequency={h.frequency}
                />
              </Card>
            );
          })}
          <AddHabitButton />
        </div>
      )}
    </PageLayout>
  );
}
