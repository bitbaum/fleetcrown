import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback } from "@/db/schema";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { appUrl, feedbackShippedTemplate, sendEmailFire } from "@/lib/email";
import { normalizeSubmitterEmail, trackUrl } from "@/lib/feedback/submitter";

/**
 * Close the feedback loop honestly.
 *
 * "Shipped" / Done is not "the agent run closed SUCCESS". That used to
 * auto-resolve rows (and email visitors) the moment inject→run finished —
 * which claimed the live product changed when only a prompt had been
 * delivered and a session had ended. Resolve is now an operator (or later
 * live-stamp / merged-PR) act; the visitor email fires from that path.
 *
 * `resolveFeedbackForRun` remains for a future evidence-gated closer
 * (merged PR / deploy stamp). Do not call it from a bare SUCCESS close.
 */

type ShippableRow = {
  id: string;
  contact: string | null;
  suggestion: string;
  page: string | null;
  projectId: string;
  source: string | null;
  /** The address as the ingest normalized it. Null on rows filed before the
   *  column existed, where `contact` is still parsed as the fallback. */
  submitterEmail: string | null;
  /** Null on rows filed before track tokens existed — the mail then goes out
   *  without a button rather than with a broken one. */
  trackToken: string | null;
};

async function emailVisitorShipped(row: ShippableRow): Promise<void> {
  // Only real visitors get the "your feedback shipped" email — agent-filed
  // rows (AI review / synthesizer) have no one to notify. Explicit guard;
  // the address check below also rejects the legacy contact strings that are
  // names rather than addresses.
  if (row.source && row.source !== FEEDBACK_SOURCE.VISITOR) return;
  // One rule for "is this a reachable address", shared with attribution. This
  // file used to carry its own copy of the regex, which meant the set of rows
  // we would EMAIL and the set we would attribute to an account could quietly
  // diverge — and the two are supposed to be the same set by definition.
  const contact = row.submitterEmail ?? normalizeSubmitterEmail(row.contact);
  if (!contact) return;
  const [project] = await db
    .select({ name: entities.name })
    .from(entities)
    .where(eq(entities.id, row.projectId))
    .limit(1);
  const site = project?.name ?? "the site";
  const excerpt = row.suggestion.length > 140 ? `${row.suggestion.slice(0, 140)}…` : row.suggestion;
  // The mail's whole job is to end the silence, so it should land the reporter
  // somewhere that shows them what changed — not just assert that something
  // did. `appUrl()` rather than a request origin: this runs from a cron and a
  // run-close, where there is no request to read one from.
  const mail = feedbackShippedTemplate({
    site,
    excerpt,
    page: row.page,
    trackUrl: row.trackToken ? trackUrl(appUrl(), row.trackToken) : null,
  });
  sendEmailFire(contact, mail.subject, mail.html, mail.text);
}

/** Operator (or evidence) marked the row resolved — tell the visitor once. */
export async function notifyFeedbackShipped(feedbackId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        id: siteFeedback.id,
        contact: siteFeedback.contact,
        suggestion: siteFeedback.suggestion,
        page: siteFeedback.page,
        projectId: siteFeedback.projectId,
        source: siteFeedback.source,
        submitterEmail: siteFeedback.submitterEmail,
        trackToken: siteFeedback.trackToken,
        status: siteFeedback.status,
      })
      .from(siteFeedback)
      .where(eq(siteFeedback.id, feedbackId))
      .limit(1);
    if (!row || row.status !== FEEDBACK_STATUS.RESOLVED) return;
    await emailVisitorShipped(row);
  } catch (err) {
    console.error("[feedback-close-loop]", err instanceof Error ? err.message : err);
  }
}

/**
 * Evidence-gated closer: flip dispatched rows for this run to resolved and
 * email visitors. Call only with real ship evidence (merged PR / live stamp),
 * never from a bare SUCCESS run close.
 */
export async function resolveFeedbackForRun(runId: string): Promise<void> {
  try {
    const resolved = await db
      .update(siteFeedback)
      .set({ status: FEEDBACK_STATUS.RESOLVED, resolvedAt: new Date() })
      .where(
        and(
          eq(siteFeedback.dispatchedRunId, runId),
          eq(siteFeedback.status, FEEDBACK_STATUS.DISPATCHED),
        ),
      )
      .returning({
        id: siteFeedback.id,
        contact: siteFeedback.contact,
        suggestion: siteFeedback.suggestion,
        page: siteFeedback.page,
        projectId: siteFeedback.projectId,
        source: siteFeedback.source,
        submitterEmail: siteFeedback.submitterEmail,
        trackToken: siteFeedback.trackToken,
      });

    for (const row of resolved) {
      await emailVisitorShipped(row);
    }
  } catch (err) {
    // The run-close path must survive a feedback hiccup untouched.
    console.error("[feedback-close-loop]", err instanceof Error ? err.message : err);
  }
}
