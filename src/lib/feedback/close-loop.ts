import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback } from "@/db/schema";
import { FEEDBACK_SOURCE, FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { feedbackShippedTemplate, sendEmailFire } from "@/lib/email";

/**
 * Close the feedback loop: when a dispatched fix-run finishes successfully,
 * flip its feedback rows to resolved and tell the visitor their feedback
 * shipped (one line, only when they left an email). Feedback that visibly
 * ships generates more and better feedback — this is the flywheel, not a
 * courtesy.
 *
 * Called fire-and-forget from the run-close path; must never throw into it.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resolveFeedbackForRun(runId: string): Promise<void> {
  try {
    const resolved = await db
      .update(siteFeedback)
      .set({ status: FEEDBACK_STATUS.RESOLVED, resolvedAt: new Date() })
      .where(and(
        eq(siteFeedback.dispatchedRunId, runId),
        eq(siteFeedback.status, FEEDBACK_STATUS.DISPATCHED),
      ))
      .returning({
        id: siteFeedback.id,
        contact: siteFeedback.contact,
        suggestion: siteFeedback.suggestion,
        page: siteFeedback.page,
        projectId: siteFeedback.projectId,
        source: siteFeedback.source,
      });

    for (const row of resolved) {
      // Only real visitors get the "your feedback shipped" email — agent-filed
      // rows (AI review / synthesizer) have no one to notify. Explicit guard;
      // the EMAIL_RE check below also catches the legacy contact strings.
      if (row.source && row.source !== FEEDBACK_SOURCE.VISITOR) continue;
      const contact = row.contact?.trim();
      if (!contact || !EMAIL_RE.test(contact)) continue;
      const [project] = await db
        .select({ name: entities.name })
        .from(entities)
        .where(eq(entities.id, row.projectId))
        .limit(1);
      const site = project?.name ?? "the site";
      const excerpt = row.suggestion.length > 140 ? `${row.suggestion.slice(0, 140)}…` : row.suggestion;
      const mail = feedbackShippedTemplate({ site, excerpt, page: row.page });
      sendEmailFire(contact, mail.subject, mail.html, mail.text);
    }
  } catch (err) {
    // The run-close path must survive a feedback hiccup untouched.
    console.error("[feedback-close-loop]", err instanceof Error ? err.message : err);
  }
}
