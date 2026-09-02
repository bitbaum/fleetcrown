"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, MessagesSquare } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { compactDurationHours } from "@/lib/dates";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";
import { FEEDBACK_WORK_PHASE } from "@/lib/feedback/work-phase";
import type { FeedbackLoopMetrics, UserFeedbackListItem } from "@/db/queries/site-feedback";
import type { FeedbackWorkView } from "@/lib/feedback/work-phase";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackItemRow } from "@/components/feedback/FeedbackItemRow";
import { useFeedbackActions } from "@/components/feedback/use-feedback-actions";
import { cn } from "@/lib/utils";

type InboxItem = UserFeedbackListItem & { work: FeedbackWorkView };

const SOURCE_FILTERS = [
  { key: null, label: "All sources" },
  { key: FEEDBACK_SOURCE.VISITOR, label: "Visitors" },
  { key: FEEDBACK_SOURCE.AI_REVIEW, label: "AI review" },
  { key: FEEDBACK_SOURCE.SYNTHESIZER, label: "Briefs" },
] as const;

/**
 * The cross-project feedback inbox behind /feedback. Separation of concerns:
 * Control stays operations (what is running), Projects stays the catalog —
 * this page owns the ironing-out loop: every report across the fleet, what
 * phase its fix is in, and the next action, without opening a project first.
 *
 * Three groups in work order: Needs you (untriaged), In progress (a fix run
 * exists — queued/working/stuck/failed/done), Shipped (resolved). Archived
 * stays behind a toggle.
 */
export function FeedbackInbox() {
  // `loadError` is aliased because `error` below is the *mutation* error from
  // useFeedbackActions. They are different failures and the page shows them in
  // different places; sharing the name is how the load error got dropped.
  const {
    data,
    loading,
    error: loadError,
    refetch,
  } = useFetch<{
    feedback: InboxItem[];
    metrics: FeedbackLoopMetrics | null;
  }>("/api/feedback/inbox");
  const searchParams = useSearchParams();
  const [projectFilter, setProjectFilter] = useState<string | null>(() =>
    searchParams.get("project"),
  );
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { busyId, error, dispatchFix, setStatus, feature } = useFeedbackActions(refetch);

  const all = useMemo(() => data?.feedback ?? [], [data]);
  const metrics = data?.metrics ?? null;

  // Same honesty poll as the project section: while any fix is in flight,
  // keep the phases fresh.
  useEffect(() => {
    const live = all.some(
      (f) =>
        f.work.phase === FEEDBACK_WORK_PHASE.QUEUED || f.work.phase === FEEDBACK_WORK_PHASE.WORKING,
    );
    if (!live) return;
    const t = window.setInterval(() => refetch(), 8_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while any row is live; refetch identity is stable enough
  }, [all.map((f) => f.work.phase).join("|")]);

  // Project chips come from the data itself — a project appears here exactly
  // when it has feedback, with its open count.
  const projects = useMemo(() => {
    const byName = new Map<string, { name: string; open: number }>();
    for (const f of all) {
      if (f.status === FEEDBACK_STATUS.ARCHIVED) continue;
      const entry = byName.get(f.projectName) ?? { name: f.projectName, open: 0 };
      if (f.status === FEEDBACK_STATUS.NEW || f.status === FEEDBACK_STATUS.DISPATCHED)
        entry.open += 1;
      byName.set(f.projectName, entry);
    }
    return [...byName.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [all]);

  const filtered = all.filter((f) => {
    if (projectFilter && f.projectName !== projectFilter) return false;
    if (sourceFilter && (f.source ?? FEEDBACK_SOURCE.VISITOR) !== sourceFilter) return false;
    return true;
  });

  const needsYou = filtered.filter((f) => f.status === FEEDBACK_STATUS.NEW);
  const inProgress = filtered.filter((f) => f.status === FEEDBACK_STATUS.DISPATCHED);
  const shipped = filtered.filter((f) => f.status === FEEDBACK_STATUS.RESOLVED);
  const archived = filtered.filter((f) => f.status === FEEDBACK_STATUS.ARCHIVED);

  if (loading && all.length === 0) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-text-tertiary">
        <Loader2 className="ui-spinner-xs" /> Loading your inbox…
      </div>
    );
  }

  // An empty list because the request failed is not "no feedback yet" — it is
  // an unanswered question, and this page is the one place an operator checks
  // to be sure nothing is waiting. Answer the question that was actually asked.
  if (all.length === 0 && loadError) {
    return (
      <EmptyState icon={AlertTriangle} title="Couldn't load feedback">
        The inbox request failed, so this is not a claim that there is no feedback.{" "}
        <button
          type="button"
          onClick={refetch}
          className="text-accent-text underline-offset-2 hover:underline"
        >
          Try again
        </button>
        .
      </EmptyState>
    );
  }

  if (all.length === 0) {
    return (
      <EmptyState icon={MessagesSquare} title="No feedback yet">
        Feedback lands here from every project&apos;s widget — visitor reports, AI-review findings,
        and synthesized briefs, each with the live status of its fix. Enable the widget on a project
        page (Feedback section → Widget), or read{" "}
        <Link
          href="/docs/feedback-widget"
          className="text-accent-text underline-offset-2 hover:underline"
        >
          how the widget works
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setProjectFilter(null)}
          className={cn(
            "ui-projects-filter-chip",
            projectFilter === null && "ui-projects-filter-chip-active",
          )}
        >
          All projects
        </button>
        {projects.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => setProjectFilter((v) => (v === p.name ? null : p.name))}
            className={cn(
              "ui-projects-filter-chip",
              projectFilter === p.name && "ui-projects-filter-chip-active",
            )}
          >
            {p.name}
            {p.open > 0 && <span className="ui-projects-filter-count">{p.open}</span>}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border-subtle sm:block" aria-hidden="true" />
        {SOURCE_FILTERS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setSourceFilter(s.key)}
            className={cn(
              "ui-projects-filter-chip",
              sourceFilter === s.key && "ui-projects-filter-chip-active",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {metrics && metrics.resolved > 0 && (
        <p className="text-xs text-text-tertiary">
          {metrics.open} open · {metrics.resolved} resolved
          {metrics.medianResolutionHours != null &&
            ` · median ${compactDurationHours(metrics.medianResolutionHours)} report→fix`}
        </p>
      )}

      {error && <p className="ui-error">{error}</p>}

      <InboxSection title="Needs you" count={needsYou.length} emptyHint="Nothing waiting on you.">
        {needsYou.map((f) => (
          <Row
            key={f.id}
            f={f}
            busyId={busyId}
            dispatchFix={dispatchFix}
            setStatus={setStatus}
            feature={feature}
          />
        ))}
      </InboxSection>

      <InboxSection title="In progress" count={inProgress.length} emptyHint="No fixes in flight.">
        {inProgress.map((f) => (
          <Row
            key={f.id}
            f={f}
            busyId={busyId}
            dispatchFix={dispatchFix}
            setStatus={setStatus}
            feature={feature}
          />
        ))}
      </InboxSection>

      <InboxSection title="Shipped" count={shipped.length} emptyHint="Nothing resolved yet.">
        {shipped.map((f) => (
          <Row
            key={f.id}
            f={f}
            busyId={busyId}
            dispatchFix={dispatchFix}
            setStatus={setStatus}
            feature={feature}
          />
        ))}
      </InboxSection>

      {archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs text-text-muted underline-offset-2 hover:underline"
            aria-expanded={showArchived}
          >
            {showArchived ? "Hide archived" : `Show archived (${archived.length})`}
          </button>
          {showArchived && (
            <div className="mt-2 divide-y divide-border-subtle opacity-70">
              {archived.map((f) => (
                <Row
                  key={f.id}
                  f={f}
                  busyId={busyId}
                  dispatchFix={dispatchFix}
                  setStatus={setStatus}
                  feature={feature}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InboxSection({
  title,
  count,
  emptyHint,
  children,
}: {
  title: string;
  count: number;
  emptyHint: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-1 flex items-baseline gap-2 text-sm font-semibold text-text-primary">
        {title}
        {count > 0 && <span className="ui-badge">{count}</span>}
      </h2>
      {count === 0 ? (
        <p className="py-2 text-xs text-text-muted">{emptyHint}</p>
      ) : (
        <div className="divide-y divide-border-subtle">{children}</div>
      )}
    </section>
  );
}

function Row({
  f,
  busyId,
  dispatchFix,
  setStatus,
  feature,
}: {
  f: InboxItem;
  busyId: string | null;
  dispatchFix: (id: string, note?: string) => void;
  setStatus: (id: string, status: FeedbackStatus) => void;
  feature: (id: string, featured: boolean) => void;
}) {
  return (
    <FeedbackItemRow
      feedback={f}
      projectName={f.projectName}
      project={{ id: f.projectId, name: f.projectName }}
      busy={busyId === f.id}
      onDispatch={(note) => dispatchFix(f.id, note)}
      onResolve={() => setStatus(f.id, FEEDBACK_STATUS.RESOLVED)}
      onArchive={() => setStatus(f.id, FEEDBACK_STATUS.ARCHIVED)}
      onReopen={() => setStatus(f.id, FEEDBACK_STATUS.NEW)}
      onFeature={() => feature(f.id, !f.featuredAt)}
    />
  );
}
