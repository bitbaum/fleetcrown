import { Bot, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getRecentOrchestrationRuns } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { timeAgo } from "@/lib/dates";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { getHealthShort } from "@/lib/constants/control";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { ControlDispatchButton } from "@/components/shared/ControlDispatchButton";

export async function RecentRunsCard() {
  const userId = await requirePageUserId();
  const runs = await getRecentOrchestrationRuns(userId);

  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader icon={Bot} title="Recent Agent Work" right={<Link href="/control" className="ui-link-subtle">Control →</Link>} />
        <p className="text-sm text-text-muted">No agent runs in the past 24 hours.</p>
      </Card>
    );
  }

  return (
    <Card>
        <CardHeader
          icon={Bot}
          title="Recent Agent Work"
          right={
            <Link href="/control" className="ui-link-subtle">
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
            const next = run.summary?.next ?? "";

            return (
              <div key={run.id} className="flex items-start gap-3 pb-2 last:pb-0 border-b border-border-subtle/50 last:border-0">
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
                  {next && (
                    <div className="mt-1 flex items-start gap-1">
                      <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-accent-text/80" />
                      <p className="flex-1 text-xs text-accent-text/80 leading-relaxed line-clamp-2">{next}</p>
                      <IvyDispatchButton
                        prompt={`Project: ${run.projectKey}\nAgent recommended next step: ${next}\n\nPlease help me execute this next step.`}
                        title="Ask Ivy to execute this next step"
                      />
                      <ControlDispatchButton
                        tab={run.projectKey}
                        prompt={`Project: ${run.projectKey}\nPrevious run: ${done}\nNext step: ${next}\n\nPlease execute this next step in the codebase.`}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
  );
}
