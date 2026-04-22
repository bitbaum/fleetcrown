import { Target, Clock } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getGoalsDueSoon } from "@/db/queries/today";
import { formatDistanceToNow, isPast } from "date-fns";
import Link from "next/link";

export async function GoalsDueCard() {
  const items = await getGoalsDueSoon(14);

  if (items.length === 0) return null;

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Target}
          title="Goals Due Soon"
          right={
            <span className="text-xs text-amber-400 font-medium">
              {items.length} within 14 days
            </span>
          }
        />
        <div className="space-y-3">
          {items.map((goal) => {
            const date = goal.targetDate ? new Date(goal.targetDate) : null;
            const overdue = date ? isPast(date) : false;
            const progress = goal.progress ?? 0;

            return (
              <div key={goal.id} className="flex items-center gap-3">
                {/* Progress ring (simple bar) */}
                <div className="shrink-0 flex flex-col items-center gap-1 w-10">
                  <span className="text-xs font-mono text-white/50">{progress}%</span>
                  <div className="w-10 h-1 bg-white/[0.08] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        progress >= 80 ? "bg-emerald-500" : progress >= 50 ? "bg-amber-500" : "bg-white/25"
                      }`}
                      style={{ width: `${Math.max(progress, 2)}%` }}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{goal.title}</div>
                  {date && (
                    <div className={`flex items-center gap-1 text-xs mt-0.5 ${overdue ? "text-red-400" : "text-amber-400/80"}`}>
                      <Clock className="h-3 w-3 shrink-0" />
                      {overdue ? "Overdue" : "Due"}{" "}
                      {formatDistanceToNow(date, { addSuffix: true })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-white/[0.05]">
          <Link href="/goals" className="text-xs text-white/25 hover:text-white/50 transition-colors">
            Open Goals →
          </Link>
        </div>
      </Card>
    </div>
  );
}
