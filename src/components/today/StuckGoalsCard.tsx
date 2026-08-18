import { CirclePause } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getStuckGoals } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { isPrivateZoneLocked } from "@/lib/private-zone";
import { STALE_GOALS_DAYS } from "@/lib/constants/today";
import { AbandonGoalButton } from "./AbandonGoalButton";
import { LokiDispatchButton } from "@/components/shared/LokiDispatchButton";
import { ControlDispatchButton } from "@/components/shared/ControlDispatchButton";
import { NAV } from "@/config/navigation";

const idleDaysSince = (updatedAt: Date | string): number =>
  Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));

export async function StuckGoalsCard() {
  const userId = await requirePageUserId();
  if (await isPrivateZoneLocked(userId)) {
    return null;
  }
  const items = await getStuckGoals(userId);

  if (items.length === 0) {
    return (
      <Card id="stuck-goals">
        <CardHeader icon={CirclePause} title="Stalled Goals" right={<span className="text-xs text-status-positive font-medium">All on track</span>} />
        <p className="text-sm text-text-muted">No goals stuck at 0% — good momentum.</p>
      </Card>
    );
  }

  return (
    <Card id="stuck-goals">
        {/* The idle threshold was a literal "30+" — agreed with getStuckGoals'
            default by coincidence, not by reference, so the two would
            silently drift the moment STALE_GOALS_DAYS ever changed. */}
        <CardHeader
          icon={CirclePause}
          title="Stalled Goals"
          right={
            <span className="text-xs text-status-warning font-medium">
              0% · {STALE_GOALS_DAYS}+ days idle
            </span>
          }
        />
        <div className="space-y-2.5">
          {items.map((goal) => {
            const idle = idleDaysSince(goal.updatedAt);
            return (
              <div key={goal.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-secondary truncate" title={goal.title}>
                    {goal.title}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-text-muted">{idle}d idle</span>
                <LokiDispatchButton
                  prompt={`Goal: ${goal.title}\nProgress: 0%\nIdle for ${idle} days with no progress.\n\nThis goal has been completely stalled. What is the single smallest concrete step I can take right now to get it moving?`}
                  title="Ask Loki to unblock this goal"
                />
                {goal.entityName && (
                  <ControlDispatchButton tab={goal.entityName} />
                )}
                <AbandonGoalButton goalId={goal.id} />
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-border-subtle">
          <Link href={NAV.goals.href} className="ui-link-subtle">
            Review in Goals →
          </Link>
        </div>
      </Card>
  );
}
