/**
 * Assemble what the PUBLIC report page shows, read-only.
 *
 * Why this exists next to `attachFeedbackWork` rather than calling it: that
 * function is the OPERATOR's loader and it has side effects on purpose — it
 * re-checks pull requests against GitHub, can advance the auto-ship ledger, and
 * fires "your fix shipped" notifications. All of that is correct behaviour when
 * an operator opens their own inbox, and all of it would be wrong here, where
 * the caller is an anonymous stranger holding a link: a page a bot can crawl
 * must not be able to drive our GitHub budget or push notifications at someone.
 *
 * So this path reads the linked run and derives the phase, full stop.
 */
import { getOrchestrationRunsByIds } from "@/db/queries/orchestration-runs";
import { runToFeedbackSnapshot } from "@/lib/feedback/attach-work";
import { deriveFeedbackWork } from "@/lib/feedback/work-phase";
import {
  publicDidLine,
  publicFeedbackStatus,
  type PublicFeedbackStatus,
} from "@/lib/feedback/public-status";
import type { FeedbackStatus } from "@/lib/constants/statuses";

export type PublicReportView = {
  status: PublicFeedbackStatus;
  /** The agent's own line about what it built — only ever set once shipped,
   *  and stripped of links. See publicDidLine for the two gates. */
  didLine: string | null;
};

export async function resolvePublicReportView(row: {
  status: FeedbackStatus;
  /** The project OWNER — the run belongs to them, not to the reader. Used to
   *  scope the run lookup, never rendered. */
  userId: string;
  dispatchedRunId: string | null;
}): Promise<PublicReportView> {
  let snapshot = null;
  if (row.dispatchedRunId) {
    // A failure here must not 500 the reporter's page. Without the run the
    // phase derives to "still open", which is a defensible thing to say when
    // we genuinely cannot see the work.
    const runs = await getOrchestrationRunsByIds(row.userId, [row.dispatchedRunId]).catch(
      () => null,
    );
    snapshot = runToFeedbackSnapshot(runs?.get(row.dispatchedRunId));
  }
  const work = deriveFeedbackWork(row.status, snapshot);
  const status = publicFeedbackStatus(row.status, work);
  return { status, didLine: publicDidLine(status.step, work.didLine) };
}

/**
 * The same resolution for a whole list, without N+1.
 *
 * The Sent list spans projects and therefore OWNERS — the runs belong to
 * whoever owns each project, not to the reader — so run lookups are grouped by
 * owner and issued one query per owner rather than one per row. A reporter
 * following twenty reports across three sites costs three queries, not twenty.
 */
export async function resolvePublicReportViews<
  T extends { status: FeedbackStatus; userId: string; dispatchedRunId: string | null },
>(rows: T[]): Promise<(T & { view: PublicReportView })[]> {
  const byOwner = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.dispatchedRunId) continue;
    const ids = byOwner.get(row.userId) ?? [];
    ids.push(row.dispatchedRunId);
    byOwner.set(row.userId, ids);
  }

  const runs = new Map<
    string,
    Awaited<ReturnType<typeof getOrchestrationRunsByIds>> extends Map<string, infer V> ? V : never
  >();
  await Promise.all(
    [...byOwner].map(async ([ownerId, ids]) => {
      // One owner's runs being unreadable must not blank the whole list — the
      // rows that depended on them fall back to "still open", the rest render.
      const found = await getOrchestrationRunsByIds(ownerId, [...new Set(ids)]).catch(() => null);
      for (const [id, run] of found ?? []) runs.set(id, run);
    }),
  );

  // Attached to the rows rather than returned as a side map keyed by id. A map
  // forces every caller to write a "what if it is missing" branch for a case
  // that cannot happen, and the branch has to invent status copy — a second
  // copy of wording that public-status.ts owns, free to drift from it.
  return rows.map((row) => {
    const snapshot = row.dispatchedRunId
      ? runToFeedbackSnapshot(runs.get(row.dispatchedRunId))
      : null;
    const work = deriveFeedbackWork(row.status, snapshot);
    const status = publicFeedbackStatus(row.status, work);
    return { ...row, view: { status, didLine: publicDidLine(status.step, work.didLine) } };
  });
}
