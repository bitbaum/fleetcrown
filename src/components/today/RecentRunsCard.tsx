import { Bot } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getRecentOrchestrationRuns } from "@/db/queries/today";
import { getCurrentUserId } from "@/lib/session";
import { timeAgo } from "@/lib/dates";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { getHealthShort } from "@/lib/constants/control";

export async function RecentRunsCard() {
  const userId = await getCurrentUserId();
  const runs = await getRecentOrchestrationRuns(userId);

  if (runs.length === 0) return null;

  return (
    <div className="md:col-span-2">
      <Card>
        <CardHeader
          icon={Bot}
          title="Recent Agent Work"
          right={
            <Link href="/control" className="text-xs text-text-tertiary hover:text-text-secondary transition-colors">
              Control →
            </Link>
          }
        />
        <div className="space-y-2">
          {runs.map((run) => {
            const health = run.summary?.health ?? "";
            const healthShort = health ? getHealthShort(health) : "";
            const tagCls = HEALTH_TAG_STYLE[healthShort];
            const done = run.summary?.done ?? "";

            return (
              <div key={run.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-secondary">{run.projectKey}</span>
                    {tagCls && healthShort && (
                      <span className={tagCls}>{healthShort}</span>
                    )}
                    <span className="ml-auto text-xs text-text-muted shrink-0">
                      {run.finishedAt ? timeAgo(run.finishedAt.getTime()) : ""}
                    </span>
                  </div>
                  {done && (
                    <p className="mt-0.5 text-xs text-text-tertiary leading-relaxed line-clamp-2">{done}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
