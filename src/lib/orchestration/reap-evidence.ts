/**
 * Post-reap honesty pass: a run the reaper just stamped `timeout` ("no
 * evidence of work") gets one more chance — if the project's GitHub repo
 * shows a PR opened or a branch pushed during the run window, the verdict is
 * corrected to `partial` with the evidence linked on the run. Born from the
 * 2026-07-28 recovery where two timed-out box runs had each shipped a real
 * fix (PRs #118/#120) that only existed on origin.
 *
 * Fire-and-forget from the reaper: GitHub lookups must never add latency to
 * the page-load reap call sites, and a correction that arrives a few seconds
 * after the reap is still a correction.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities } from "@/db/schema";
import { ORCHESTRATION_OUTCOME, orchestrationRuns } from "@/db/schema/orchestration-runs";
import { ORCH_STATE } from "@/lib/orchestration/contract";
import { emitRunEvent } from "@/db/queries/run-events";
import { getGithubToken } from "@/lib/github-token";
import { findRepoWorkEvidence } from "@/lib/github-evidence";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

export type ReapedRunForEvidence = {
  id: string;
  userId: string;
  projectKey: string;
  outcome: string | null;
  startedAt: Date;
};

/** Bound GitHub API work per sweep — a backlog of dead runs must not turn the
 *  janitor into a rate-limit problem; the next hourly tick gets the rest. */
const MAX_CHECKS_PER_SWEEP = 5;

export async function correctTimeoutReapsWithRepoEvidence(reaped: ReapedRunForEvidence[]): Promise<void> {
  const timeouts = reaped
    .filter((r) => r.outcome === ORCHESTRATION_OUTCOME.TIMEOUT)
    .slice(0, MAX_CHECKS_PER_SWEEP);

  for (const run of timeouts) {
    try {
      const project = await db.query.entities.findFirst({
        where: and(
          eq(entities.userId, run.userId),
          eq(entities.type, ENTITY_TYPE.PROJECT),
          sql`lower(${entities.name}) = lower(${run.projectKey})`,
        ),
        columns: { gitUrl: true },
      });
      if (!project?.gitUrl) continue;

      const token = await getGithubToken(run.userId);
      if (!token) continue;

      const evidence = await findRepoWorkEvidence(project.gitUrl, token, run.startedAt.getTime());
      if (!evidence) continue;

      const [corrected] = await db
        .update(orchestrationRuns)
        .set({
          state: ORCH_STATE.DONE,
          outcome: ORCHESTRATION_OUTCOME.PARTIAL,
          payload: sql`jsonb_set(
            jsonb_set(COALESCE(payload, '{}'), '{error}', to_jsonb(
              'Reaped as timeout, but the repo shows work during the run window — corrected to partial (see evidence)'::text)),
            '{evidence}', ${JSON.stringify(evidence)}::jsonb)`,
        })
        // Only correct a run that is STILL a timeout — never overwrite a
        // verdict some other close path landed in the meantime.
        .where(and(
          eq(orchestrationRuns.id, run.id),
          eq(orchestrationRuns.outcome, ORCHESTRATION_OUTCOME.TIMEOUT),
        ))
        .returning({ id: orchestrationRuns.id });

      if (corrected) {
        void emitRunEvent(run.id, run.userId, "closed", {
          outcome: ORCHESTRATION_OUTCOME.PARTIAL,
          by: "reaper-evidence",
          evidence,
        });
      }
    } catch (err) {
      console.error("[reap-evidence]", run.id, err instanceof Error ? err.message : err);
    }
  }
}
