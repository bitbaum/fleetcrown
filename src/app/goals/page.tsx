import { Target, Plus, CheckCircle } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { getGoals, getGoalStats, type GoalWithChildren } from "@/db/queries/goals";
import { formatDistanceToNow } from "date-fns";

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

function GoalCard({ goal, depth }: { goal: GoalWithChildren; depth: number }) {
  const isCompleted = goal.status === "completed";
  const progress = goal.progress ?? 0;
  const milestoneDone = goal.milestones?.filter((m) => m.done).length ?? 0;
  const milestoneTotal = goal.milestones?.length ?? 0;

  return (
    <div>
      <Card className={isCompleted ? "opacity-60" : ""}>
        <div className="flex items-start gap-3">
          {isCompleted ? (
            <CheckCircle className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
          ) : depth === 0 ? (
            <Target className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <div className="h-4 w-4 rounded border border-white/20 shrink-0 mt-1" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className={depth === 0 ? "text-base md:text-lg font-semibold" : "text-sm md:text-base font-medium text-white/80"}>{goal.title}</div>
              {goal.status && goal.status !== "active" && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                  {goal.status}
                </span>
              )}
            </div>
            {goal.description && (
              <div className="text-xs md:text-sm text-white/40 mt-1">{goal.description}</div>
            )}

            {/* Progress bar */}
            {!isCompleted && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs md:text-sm text-white/40 mb-1">
                  <span>{progress}%</span>
                  {goal.targetDate && (
                    <span>
                      Target: {formatDistanceToNow(new Date(goal.targetDate), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/60 rounded-full transition-all"
                    style={{ width: `${Math.max(progress, 1)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Milestones */}
            {milestoneTotal > 0 && (
              <div className="mt-2 space-y-1">
                {goal.milestones!.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs md:text-sm">
                    {m.done ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-400/60" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-white/20" />
                    )}
                    <span className={m.done ? "text-white/40 line-through" : "text-white/60"}>
                      {m.title}
                    </span>
                  </div>
                ))}
                <div className="text-xs text-white/30 mt-1">
                  {milestoneDone}/{milestoneTotal} milestones
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Children */}
      {goal.children.length > 0 && (
        <div className="mt-2 ml-6 pl-5 border-l-2 border-emerald-500/20 space-y-2">
          {goal.children.map((child) => (
            <GoalCard key={child.id} goal={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
