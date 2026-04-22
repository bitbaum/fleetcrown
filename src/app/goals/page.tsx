import { Target } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getGoals, getGoalStats } from "@/db/queries/goals";
import { GoalCard } from "@/components/goals/GoalCard";
import { NewGoalButton } from "@/components/goals/NewGoalButton";
import { CompletedGoals } from "@/components/goals/CompletedGoals";

export default async function GoalsPage() {
  const [goalTree, stats] = await Promise.all([getGoals(), getGoalStats()]);

  const activeGoals = goalTree.filter((g) => g.status !== "completed");
  const completedGoals = goalTree.filter((g) => g.status === "completed");

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
          <div className="flex flex-col items-center gap-3 py-8 text-white/30">
            <Target className="h-10 w-10" />
            <div className="text-sm">No goals yet</div>
            <div className="text-xs">
              Goals connect your projects, commitments, and people to what matters.
              <br />
              Ivy can help you define them — ask her.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {activeGoals.length > 0 && (
            <div className="space-y-3">
              {activeGoals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} depth={0} />
              ))}
            </div>
          )}

          {activeGoals.length === 0 && completedGoals.length > 0 && (
            <Card>
              <div className="flex flex-col items-center gap-2 py-6 text-white/30">
                <Target className="h-8 w-8" />
                <div className="text-sm">All goals completed</div>
              </div>
            </Card>
          )}

          <CompletedGoals goals={completedGoals} />
        </>
      )}
    </PageLayout>
  );
}
