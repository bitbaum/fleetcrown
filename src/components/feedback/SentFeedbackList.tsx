import Link from "next/link";
import { ExternalLink, Send } from "lucide-react";
import { TrackedReportStatus } from "@/components/feedback/TrackedReportStatus";
import { EmptyState } from "@/components/ui/empty-state";
import { livePageHref } from "@/lib/feedback/fix-shipping";
import { PUBLIC_FEEDBACK_STEP, type PublicFeedbackStatus } from "@/lib/feedback/public-status";
import { trackPath } from "@/lib/feedback/submitter";
import { compactRelativeDate } from "@/lib/dates";
import type { SentFeedbackItem } from "@/db/queries/site-feedback";

export type SentRow = SentFeedbackItem & {
  view: { status: PublicFeedbackStatus; didLine: string | null };
};

/**
 * Reports this person filed, on anyone's site.
 *
 * Deliberately the reporter's view and not the operator's: the same ladder and
 * the same words as the public /f/<token> page, with no triage controls. A
 * report you SENT is not yours to implement, archive or resolve — those live on
 * the Received side, where you own the project.
 */
export function SentFeedbackList({ rows }: { rows: SentRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={Send} title="Nothing sent yet">
        When you send feedback through a Loki widget on any site, it collects here — with what
        happened to it. Reports you filed before you had an account join this list once you open
        their follow-up link.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const shipped = row.view.status.step === PUBLIC_FEEDBACK_STEP.SHIPPED;
        const liveHref = shipped ? livePageHref(row.liveUrl, row.url, row.page) : null;
        return (
          <li key={row.id} className="ui-card-shell p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-text-primary">{row.projectName}</span>
              <span className="ui-track-meta">
                {compactRelativeDate(row.createdAt)}
                {row.page ? ` · ${row.page}` : ""}
              </span>
            </div>

            <blockquote className="ui-track-quote mt-3">{row.suggestion}</blockquote>

            <TrackedReportStatus status={row.view.status} className="mt-4" />

            {row.view.didLine && <p className="ui-track-did mt-3">{row.view.didLine}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* The permanent link — the one that was emailed and shown in the
                  widget. Keeping it reachable from here means the two surfaces
                  are the same page, not two accounts of one report. */}
              {row.trackToken && (
                <Link className="ui-btn-secondary" href={trackPath(row.trackToken)}>
                  Open report
                </Link>
              )}
              {liveHref && (
                <a
                  className="ui-btn-secondary gap-1.5"
                  href={liveHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  See it live
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
