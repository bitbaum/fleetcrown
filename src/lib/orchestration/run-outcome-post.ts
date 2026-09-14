import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userProjects } from "@/db/schema";
import { addMessage } from "@/db/queries/conversations";
import { logDebug } from "@/db/queries/debug-logs";
import { getGithubToken } from "@/lib/github-token";
import { findRepoWorkEvidence } from "@/lib/github-evidence";
import { formatRunOutcomeMessage } from "@/lib/orchestration/run-outcome-format";
import type { OrchestrationRun } from "@/db/schema/orchestration-runs";

/**
 * Write a closed run's outcome into the conversation that dispatched it.
 *
 * Runs opt in by carrying payload.conversationId (set by the /loki messages
 * route). Repo evidence is looked up best-effort the same way the reaper does
 * (a PR or push in the run's window), because the agent's own handoff is a
 * claim and the pull request is the thing that will actually merge and deploy.
 *
 * Fire-and-forget by contract, like notifyRunClosed: never throws, never slows
 * a close.
 */
export async function postRunOutcomeToConversation(run: OrchestrationRun): Promise<void> {
  const conversationId = run.payload?.conversationId;
  if (!conversationId) return;
  try {
    const project = await db.query.userProjects.findFirst({
      where: and(
        eq(userProjects.userId, run.userId),
        sql`(lower(${userProjects.slug}) = lower(${run.projectKey}) OR lower(${userProjects.name}) = lower(${run.projectKey}))`,
      ),
      columns: { gitUrl: true, liveUrl: true },
    });

    let evidence = run.payload?.evidence ?? null;
    if (!evidence && project?.gitUrl && run.startedAt) {
      const token = await getGithubToken(run.userId).catch(() => null);
      if (token) {
        evidence = await findRepoWorkEvidence(project.gitUrl, token, run.startedAt.getTime()).catch(
          () => null,
        );
      }
    }

    const message = formatRunOutcomeMessage(run, { evidence, liveUrl: project?.liveUrl ?? null });
    if (!message) return;
    await addMessage(conversationId, {
      role: "assistant",
      kind: "outcome",
      content: message.content,
      meta: message.meta,
    });
  } catch (e) {
    void logDebug({
      source: "orchestration/run-outcome-post",
      level: "warn",
      message: `could not post outcome of run ${run.id} to conversation ${conversationId}: ${(e as Error).message}`,
    });
  }
}
