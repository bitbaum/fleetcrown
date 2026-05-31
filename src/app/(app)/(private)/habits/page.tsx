import { Repeat2 } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getAllHabitsWithHistory } from "@/db/queries/habits";
import { listActiveGoals } from "@/db/queries/goals";
import { getGoalsByHabitIds } from "@/db/queries/habit-goals";
import { requirePageUserId } from "@/lib/session";
import { HabitCard } from "@/components/habits/HabitCard";
import { AddHabitButton } from "@/components/habits/AddHabitButton";
import { NewHabitButton } from "@/components/habits/NewHabitButton";
import { HABIT_HISTORY_DAYS } from "@/lib/constants";

export const metadata = { title: "Habits" };

export default async function HabitsPage() {
  const userId = await requirePageUserId();
  const [habits, activeGoals] = await Promise.all([
    getAllHabitsWithHistory(userId, HABIT_HISTORY_DAYS),
    listActiveGoals(userId),
  ]);

  const habitIds = habits.map((h) => h.id);
  const linkedGoalsByHabit = await getGoalsByHabitIds(userId, habitIds);

  const active = habits.filter((h) => h.active);
  const totalCompletions = habits.reduce((s, h) => s + h.completionsInWindow, 0);
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.streak), 0);

  const goalOptions = activeGoals.map((g) => ({ id: g.id, title: g.title }));

  return (
    <PageLayout
      title="Habits"
      subtitle={`${HABIT_HISTORY_DAYS}-day history — consistency compounds`}
      right={<NewHabitButton />}
    >
      {/* Summary stats — same density fix as Goals (3f062a8) + Memory
          (1baa421) + Money (this commit's sibling): 3-col on mobile. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard label="Active Habits" value={String(active.length)} sub={`${habits.length} total`} />
        <StatCard label={`Completions (${HABIT_HISTORY_DAYS}d)`} value={String(totalCompletions)} sub="across all habits" />
        <StatCard label="Best Streak" value={bestStreak > 0 ? `${bestStreak}d` : "—"} sub="current longest" />
      </div>

      {habits.length === 0 ? (
        <Card>
          <EmptyState icon={Repeat2} title="No habits tracked yet" action={<AddHabitButton emptyState />} />
        </Card>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              linkedGoals={linkedGoalsByHabit.get(h.id) ?? []}
              activeGoals={goalOptions}
            />
          ))}
          <AddHabitButton />
        </div>
      )}
    </PageLayout>
  );
}
