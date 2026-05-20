import { Target } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getGoals, getGoalStats } from "@/db/queries/goals";
import { getHabitsByGoalIds } from "@/db/queries/habit-goals";
import { requirePageUserId } from "@/lib/session";
import { NewGoalButton } from "@/components/goals/NewGoalButton";
import { GoalsGrid } from "@/components/goals/GoalsGrid";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { APP_NAME } from "@/config/brand";
import { GOAL_STATUS } from "@/lib/constants/statuses";
import type { GoalWithChildren } from "@/db/queries/goals";

export const metadata = { title: "Goals" };

function collectGoalIds(goals: GoalWithChildren[]): string[] {
  return goals.flatMap((g) => [g.id, ...collectGoalIds(g.children)]);
}

export default async function GoalsPage() {
  const userId = await requirePageUserId();
  const [goalTree, stats] = await Promise.all([getGoals(userId), getGoalStats(userId)]);

  const allGoalIds = collectGoalIds(goalTree);
  const habitsByGoalIdMap = await getHabitsByGoalIds(userId, allGoalIds);
  const habitsByGoalId = Object.fromEntries(habitsByGoalIdMap);

  const activeGoals = goalTree.filter((g) => g.status === GOAL_STATUS.ACTIVE || !g.status);
  const completedGoals = goalTree.filter((g) => g.status === GOAL_STATUS.COMPLETED);
  const abandonedGoals = goalTree.filter((g) => g.status === GOAL_STATUS.ABANDONED);

  return (
    <PageLayout
      title="Goals"
      subtitle="Where you're going — and how you're getting there"
      right={<NewGoalButton goals={activeGoals} />}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Active Goals"
          value={String(stats.active)}
          sub={[
            stats.completed > 0 && `${stats.completed} completed`,
            stats.abandoned > 0 && `${stats.abandoned} abandoned`,
          ].filter(Boolean).join(" · ") || "none closed yet"}
        />
        <StatCard label="Avg Progress" value={`${stats.avgProgress}%`} sub="across active goals" />
        <StatCard label="Total" value={String(stats.total)} sub="goals tracked" />
      </div>

      {goalTree.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            action={
              <IvyDispatchButton
                prompt={`I'm starting to track my goals in ${APP_NAME}. I'm a builder running multiple projects.\n\nHelp me think through what my top 2–3 goals should be right now. What areas should I consider (professional, health, learning, relationships, financial)? What makes a good goal versus just a task?`}
                label="Ask Ivy to help define my goals"
                title="Ask Ivy to help define your goals"
                className="ui-callout-positive items-center gap-2 text-status-positive transition-colors hover:bg-status-positive/10"
              />
            }
          >
            Goals connect your projects, commitments, and people to what matters.
          </EmptyState>
        </Card>
      ) : (
        <GoalsGrid
          activeGoals={activeGoals}
          completedGoals={completedGoals}
          abandonedGoals={abandonedGoals}
          habitsByGoalId={habitsByGoalId}
        />
      )}
    </PageLayout>
  );
}
