"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useFetch } from "@/hooks/use-fetch";
import { compactRelativeDate } from "@/lib/dates";
import type { ProjectFeedbackSummary } from "@/db/queries/site-feedback";

/**
 * Fleet-wide feedback lens on /control: projects with NEW visitor feedback,
 * busiest first. This is the "common mailbox" as a QUERY over the per-project
 * inboxes — clicking through lands on the project's feedback section, the one
 * place feedback is triaged and dispatched. Renders nothing when the fleet
 * inbox is clear.
 */
export function FleetFeedbackStrip() {
  const { data } = useFetch<{ summary: ProjectFeedbackSummary[] }>("/api/feedback/summary");
  const summary = data?.summary ?? [];
  if (summary.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border-l-2 border-accent-primary border-t border-r border-b border-border-subtle bg-surface-base px-4 py-3">
      <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-accent-text" aria-hidden="true" />
      <div className="flex min-w-0 flex-wrap gap-2">
        <span className="mt-0.5 shrink-0 text-xs font-medium text-text-secondary">New feedback:</span>
        {summary.map((s) => (
          <Link
            key={s.projectId}
            href={`/projects/${s.projectId}#feedback`}
            className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-text-primary underline-offset-2 transition-colors hover:underline"
            title={`Latest ${compactRelativeDate(s.latestAt)} — open the ${s.projectName} feedback inbox`}
          >
            {s.projectName}
            <span className="ui-badge">{s.newCount}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
