import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { entities, siteFeedback } from "@/db/schema";
import { FEEDBACK_STATUS } from "@/lib/constants/statuses";
import { sendEmailFire } from "@/lib/email";

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
      });

    for (const row of resolved) {
      const contact = row.contact?.trim();
      if (!contact || !EMAIL_RE.test(contact)) continue;
      const [project] = await db
        .select({ name: entities.name })
        .from(entities)
        .where(eq(entities.id, row.projectId))
        .limit(1);
      const site = project?.name ?? "the site";
      const excerpt = row.suggestion.length > 140 ? `${row.suggestion.slice(0, 140)}…` : row.suggestion;
      sendEmailFire(
        contact,
        `Your feedback on ${site} shipped`,
        `<p>You reported: “${excerpt}”</p><p>A fix just went live${row.page ? ` on ${row.page}` : ""}. Thanks for pointing it out.</p>`,
        `You reported: "${excerpt}"\n\nA fix just went live${row.page ? ` on ${row.page}` : ""}. Thanks for pointing it out.`,
      );
    }
  } catch (err) {
    // The run-close path must survive a feedback hiccup untouched.
    console.error("[feedback-close-loop]", err instanceof Error ? err.message : err);
  }
}
