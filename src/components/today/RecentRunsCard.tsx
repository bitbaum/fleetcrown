import { Bot, ArrowRight, Repeat, Send } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getRecentOrchestrationRuns, getRecentDispatches } from "@/db/queries/today";
import { requirePageUserId } from "@/lib/session";
import { timeAgo } from "@/lib/dates";
import { HEALTH_TAG_STYLE } from "@/config/ui";
import { getHealthShort } from "@/lib/constants/control";
import { IvyDispatchButton } from "@/components/shared/IvyDispatchButton";
import { ControlDispatchButton } from "@/components/shared/ControlDispatchButton";
import { NAV } from "@/config/navigation";

// Adjacent runs on the same project that finished within this window collapse
// into a single row (with a "× N" badge). 1 hour matches the rough duration
// of a back-to-back session burst — anything longer feels like distinct work.
const CLUSTER_WINDOW_MS = 60 * 60 * 1000;

export async function RecentRunsCard() {
  const userId = await requirePageUserId();
  const [runs, dispatches] = await Promise.all([
    getRecentOrchestrationRuns(userId),
    getRecentDispatches(userId),
  ]);

  // No orchestration runs AND no manual dispatches → genuinely quiet day.
  if (runs.length === 0 && dispatches.length === 0) {
    return (
      <Card>
        <CardHeader icon={Bot} title="Recent Agent Work" right={<Link href={NAV.control.href} className="ui-link-subtle">Control →</Link>} />
        <p className="text-sm text-text-muted">No agent runs in the past 24 hours.</p>
      </Card>
    );
  }

  // Fallback: orchestration runs are empty but the user has dispatched prompts
  // today (manual injects via /api/inject never write to orchestration_runs).
  // Show those instead so the dashboard reflects reality.
  if (runs.length === 0) {
    return (
      <Card>
        <CardHeader icon={Bot} title="Recent Agent Work" right={<Link href={NAV.control.href} className="ui-link-subtle">Control →</Link>} />
        <p className="text-xs text-text-muted mb-2">No completed orchestration runs yet — showing recent dispatches.</p>
        <div className="space-y-2">
          {dispatches.map((d) => {
            const custom = d.customPrompt?.trim();
            // Matches the intent-badge styling shipped for the Control panel
            // activity feed (4373e84) so templated dispatches read the same
            // way in both places — uppercase pill inline with project name,
            // body row reserved for free-form custom prompts only.
            return (
              <div key={d.id} className="flex items-start gap-3 pb-2 last:pb-0 border-b border-border-subtle/50 last:border-0">
                <Send className="h-3 w-3 mt-1 shrink-0 text-accent-text/70" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-text-secondary">{d.projectKey}</span>
                    <span className="ui-badge">{d.adapter}</span>
                    {!custom && (
                      <span
                        className="rounded-full border border-accent-primary/30 bg-accent-muted px-1.5 py-0.5 text-micro font-medium uppercase tracking-wide text-accent-text"
                        title={`Templated dispatch — intent: ${d.intent}`}
                      >
                        {d.intent.replace(/_/g, " ")}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-text-muted shrink-0">{timeAgo(d.dispatchedAt.getTime())}</span>
                  </div>
                  {custom && (
                    <p className="mt-0.5 text-xs text-text-tertiary leading-relaxed line-clamp-2">{custom}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  // Cluster adjacent same-project runs. Iterates the (already finishedAt-desc)
  // list once; each row either extends the last cluster (incrementing count)
  // or starts a new one. Caught during a live audit at mobile width where
  // five "FleetCrown · 5h ago" rows in a row dominated the card.
  type Run = (typeof runs)[number];
  type Cluster = { latest: Run; count: number };
  const clusters: Cluster[] = [];
  for (const run of runs) {
    const last = clusters[clusters.length - 1];
    if (
      last &&
      last.latest.projectKey === run.projectKey &&
      last.latest.finishedAt && run.finishedAt &&
      last.latest.finishedAt.getTime() - run.finishedAt.getTime() <= CLUSTER_WINDOW_MS
    ) {
      last.count += 1;
    } else {
      clusters.push({ latest: run, count: 1 });
    }
  }

  return (
    <Card>
        <CardHeader
          icon={Bot}
          title="Recent Agent Work"
          right={
            <Link href={NAV.control.href} className="ui-link-subtle">
              Control →
            </Link>
          }
        />
        <div className="space-y-2">
          {clusters.map(({ latest: run, count }) => {
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
                    {count > 1 && (
                      <span className="ui-badge inline-flex items-center gap-1" title={`${count} runs clustered`}>
                        <Repeat className="h-2.5 w-2.5" />
                        ×{count}
                      </span>
                    )}
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
