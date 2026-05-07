import { Target, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getGoalsDueSoon } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";
import { deadlineLabel } from "@/lib/dates";
import { GOALS_DUE_SOON_DAYS } from "@/lib/constants";
import Link from "next/link";
import { ProgressBar, getProgressTone } from "@/components/ui/progress-bar";
import { GOAL_PROGRESS_THRESHOLDS } from "@/config/ui";

export async function GoalsDueCard() {
  const userId = await getCurrentUserId();
  const items = await getGoalsDueSoon(userId);

  if (items.length === 0) return null;

  return (
    <Card>
        <CardHeader
          icon={Target}
          title="Goals Due Soon"
          right={
            <span className="text-xs text-status-warning font-medium">
              {items.length} within {GOALS_DUE_SOON_DAYS} days
            </span>
          }
        />
        <div className="space-y-3">
          {items.map((goal) => {
            const date = goal.targetDate ? new Date(goal.targetDate) : null;
            const { label: deadlineText, overdue } = deadlineLabel(date);
            const progress = goal.progress ?? 0;

            return (
              <div key={goal.id} className="flex items-center gap-3">
                {/* Progress ring (simple bar) */}
                <div className="shrink-0 flex flex-col items-center gap-1 w-10">
                  <span className="text-xs font-mono text-text-secondary">{progress}%</span>
                  <ProgressBar
                    value={progress}
                    minPercent={2}
                    tone={getProgressTone(progress, {
                      positiveAt: GOAL_PROGRESS_THRESHOLDS.healthyPct,
                      warningAt: GOAL_PROGRESS_THRESHOLDS.cautionPct,
                      lowTone: "neutral",
                    })}
                    className="h-1 w-10"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" title={goal.title}>{goal.title}</div>
                  {date && (
                    <div className={`flex items-center gap-1 text-xs mt-0.5 ${overdue ? "text-status-negative" : "text-status-warning/80"}`}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {deadlineText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-border-subtle">
          <Link href="/goals" className="ui-link-subtle">
            Open Goals →
          </Link>
        </div>
      </Card>
  );
}
