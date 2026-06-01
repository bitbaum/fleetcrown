import { Target, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getGoalsDueSoon } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneConfigured, isPrivateZoneUnlocked } from "@/lib/private-zone";
import { deadlineLabel } from "@/lib/dates";
import { GOALS_DUE_SOON_DAYS } from "@/lib/constants";
import Link from "next/link";
import { GoalProgressBar } from "@/components/shared/GoalProgressBar";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";

export async function GoalsDueCard() {
  const userId = await requirePageUserId();
  // Goals live in the private zone — when PIN-locked, return nothing rather
  // than crowd Today's actionable grid with a placeholder.
  if (isPrivateZoneConfigured() && !(await isPrivateZoneUnlocked(userId))) {
    return null;
  }
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
                  <GoalProgressBar
                    value={progress}
                    minPercent={2}
                    lowTone="neutral"
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
                <IvyDispatchButton
                  prompt={`Goal: ${goal.title}\nProgress: ${progress}%\nDue: ${deadlineText}\n\nThis goal deadline is approaching${overdue ? " and is overdue" : ""}. What should I focus on right now to hit it? What are the key risks?`}
                  title="Ask Ivy about this deadline"
                />
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
