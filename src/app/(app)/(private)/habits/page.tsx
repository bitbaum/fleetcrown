import { Repeat2 } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getAllHabitsWithHistory } from "@/db/queries/habits";
import { getCurrentUserId } from "@/lib/session";
import { HabitCard } from "@/components/habits/HabitCard";
import { AddHabitButton } from "@/components/habits/AddHabitButton";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";

export const metadata = { title: "Habits" };

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
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
          <AddHabitButton />
        </div>
      )}
    </PageLayout>
  );
}
