import Link from "next/link";
import { FileText } from "lucide-react";
import { PageLayout } from "@/components/ui/page-layout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUserId } from "@/lib/session";
import { APP_LOCALE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DIGEST_WINDOWS, getProjectDigest, type DigestWindow } from "@/db/queries/digests";

export const metadata = { title: "Digests" };

const WINDOW_LABEL: Record<DigestWindow, string> = {
  hour: "Hour",
  day: "Day",
  week: "Week",
  month: "Month",
};

function hrefFor(window: DigestWindow, projectKey: string | null) {
  const params = new URLSearchParams();
  params.set("window", window);
  if (projectKey) params.set("project", projectKey);
  return `/digests?${params.toString()}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(APP_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DigestsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; project?: string }>;
}) {
  const userId = await requirePageUserId();
  const params = await searchParams;
  const digest = await getProjectDigest(userId, {
    window: params.window,
    projectKey: params.project,
  });

  const hasActivity = digest.timeline.length > 0;

  return (
    <PageLayout
      title="Digests"
      subtitle="Readable progress summaries from real dispatches and completed run handoffs. History is the raw prompt log; Decisions is the audit timeline; Digests is the human progress view."
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5">
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="ui-kicker">Window</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIGEST_WINDOWS.map((window) => (
                  <Link
                    key={window}
                    href={hrefFor(window, digest.projectKey)}
                    className={cn(
                      "ui-chip-filter",
                      digest.window === window && "ui-chip-filter-active",
                    )}
                  >
                    {WINDOW_LABEL[window]}
                  </Link>
                ))}
              </div>
            </div>
            <div className="md:text-right">
              <p className="ui-kicker">Range</p>
              <p className="mt-2 text-sm text-text-secondary">
                {formatTime(digest.since)} to {formatTime(digest.until)}
              </p>
            </div>
          </div>

          <div>
            <p className="ui-kicker">Project</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link
                href={hrefFor(digest.window, null)}
                className={cn("ui-chip-filter", digest.projectKey === null && "ui-chip-filter-active")}
              >
                All projects
              </Link>
              {digest.projects.map((project) => (
                <Link
                  key={project.key}
                  href={hrefFor(digest.window, project.key)}
                  className={cn("ui-chip-filter", digest.projectKey === project.key && "ui-chip-filter-active")}
                >
                  {project.label}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        {!hasActivity ? (
          <Card>
            <EmptyState icon={FileText} title="No digest activity in this window">
              Dispatch prompts or finish agent runs, then return here for a real progress summary.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Stat label="Prompts" value={digest.stats.promptsSent} />
              <Stat label="Runs" value={digest.stats.runsStarted} />
              <Stat label="Finished" value={digest.stats.runsFinished} />
              <Stat label="Success" value={digest.stats.success} tone="positive" />
              <Stat label="Partial" value={digest.stats.partial} tone="warning" />
              <Stat label="Errors" value={digest.stats.error} tone="negative" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <DigestList title="Completed" items={digest.completed} empty="No completed run summaries recorded." />
              <DigestList title="Next / open" items={digest.next} empty="No next-step handoffs recorded." />
              <DigestList title="Prompts sent" items={digest.prompts} empty="No prompts recorded." />
            </div>

            <Card className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Timeline</h2>
                <p className="mt-1 text-xs text-text-tertiary">
                  Raw source events used for this digest. Nothing here is generated.
                </p>
              </div>
              <div className="space-y-1">
                {digest.timeline.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-lg px-3 py-2 hover:bg-surface-raised md:grid-cols-[8rem_9rem_minmax(0,1fr)]">
                    <span className="text-xs text-text-muted">{formatTime(item.occurredAt)}</span>
                    <span className="truncate text-sm font-medium text-text-primary">{item.projectKey}</span>
                    <div className="min-w-0">
                      <p className={cn(
                        "truncate text-sm",
                        item.tone === "error" ? "text-status-negative" : item.tone === "run" ? "text-text-secondary" : "text-text-tertiary",
                      )}>
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-muted">
                          {item.body}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </PageLayout>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  const toneClass = tone === "positive"
    ? "text-status-positive"
    : tone === "warning"
      ? "text-status-warning"
      : tone === "negative"
        ? "text-status-negative"
        : "text-text-primary";
  return (
    <Card className="px-4 py-3">
      <p className="ui-kicker">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </Card>
  );
}

function DigestList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-text-secondary">
              {item}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
