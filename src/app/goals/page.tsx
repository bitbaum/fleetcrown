import { Target } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { getGoals, getGoalStats } from "@/db/queries/goals";
import { GoalCard } from "@/components/goals/GoalCard";

export default async function GoalsPage() {
  const [goalTree, stats] = await Promise.all([getGoals(), getGoalStats()]);

  return (
    <PageLayout title="Goals" subtitle="Where you're going — and how you're getting there">
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
        <div className="space-y-3">
          {goalTree.map((goal) => (
            <GoalCard key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
