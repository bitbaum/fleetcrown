import { Target } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getGoals, getGoalStats } from "@/db/queries/goals";
import { getCurrentUserId } from "@/lib/session";
import { NewGoalButton } from "@/components/goals/NewGoalButton";
import { GoalsGrid } from "@/components/goals/GoalsGrid";
import { GOAL_STATUS } from "@/lib/constants/statuses";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const userId = await getCurrentUserId();
  const [goalTree, stats] = await Promise.all([getGoals(userId), getGoalStats(userId)]);

  const activeGoals = goalTree.filter((g) => g.status !== GOAL_STATUS.COMPLETED);
  const completedGoals = goalTree.filter((g) => g.status === GOAL_STATUS.COMPLETED);

  return (
    <PageLayout
      title="Goals"
      subtitle="Where you're going — and how you're getting there"
      right={<NewGoalButton goals={activeGoals} />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Active Goals" value={String(stats.active)} sub={`${stats.completed} completed`} />
        <StatCard label="Avg Progress" value={`${stats.avgProgress}%`} sub="across active goals" />
        <StatCard label="Total" value={String(stats.total)} sub="goals tracked" />
      </div>

      {goalTree.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <Target className="h-10 w-10 text-text-tertiary" />
            <div className="text-sm text-text-secondary">No goals yet</div>
            <div className="text-xs text-text-tertiary text-center">
              Goals connect your projects, commitments, and people to what matters.
              <br />
              Ivy can help you define them — ask her.
            </div>
          </div>
        </Card>
      ) : (
        <GoalsGrid activeGoals={activeGoals} completedGoals={completedGoals} />
      )}
    </PageLayout>
  );
}
