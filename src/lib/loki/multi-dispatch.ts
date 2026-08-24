/**
 * Fan-out Loki commands to multiple projects — shared inject path, one summary.
 */
import { injectPrompt } from "@/lib/inject-core";
import { isGenericDevelopHandoff } from "@/lib/command-resolve";
import { hasOpenPendingForProject } from "@/db/queries/pending-commands";
import { isProjectBusy } from "@/db/queries/orchestration-runs";
import { MAX_CONCURRENT_BUILDING } from "@/lib/constants/control";
import type { AdapterId } from "@/lib/orchestration";
import type { Attachment } from "@/lib/loki/attachments";

export type DispatchAttempt = {
  projectKey: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  mode?: string | null;
};

export type MultiDispatchInput = {
  userId: string;
  projectKeys: string[];
  prompt: string;
  sourceText: string;
  intentId: string | null;
  attachmentSuffix: string;
  agent?: AdapterId;
  model?: string;
  attachments?: Attachment[];
};

export async function dispatchCommandToProjects(
  input: MultiDispatchInput,
): Promise<DispatchAttempt[]> {
  const results: DispatchAttempt[] = [];
  let dispatched = 0;

  for (const projectKey of input.projectKeys) {
    if (dispatched >= MAX_CONCURRENT_BUILDING) {
      results.push({ projectKey, ok: false, skipped: true, reason: "concurrency_cap" });
      continue;
    }

    if (await hasOpenPendingForProject(input.userId, projectKey)) {
      results.push({ projectKey, ok: false, skipped: true, reason: "pending_command" });
      continue;
    }

    if (await isProjectBusy(input.userId, projectKey)) {
      results.push({ projectKey, ok: false, skipped: true, reason: "busy" });
      continue;
    }

    const useIntentKey =
      Boolean(input.intentId) &&
      isGenericDevelopHandoff(input.sourceText) &&
      !(input.attachments && input.attachments.length > 0);

    const inject = await injectPrompt(
      useIntentKey
        ? {
            tab: projectKey,
            promptKey: input.intentId!,
            adapter: input.agent,
            model: input.model,
            notifyOnClose: true,
          }
        : {
            tab: projectKey,
            customPrompt: input.prompt + input.attachmentSuffix,
            adapter: input.agent,
            model: input.model,
            notifyOnClose: true,
          },
      input.userId,
    );

    const ok = inject.status < 400 && inject.body.blocked !== true;
    if (ok) dispatched++;

    results.push({
      projectKey,
      ok,
      skipped: !ok && inject.body.blocked === true,
      reason: ok
        ? undefined
        : typeof inject.body.error === "string"
          ? inject.body.error
          : inject.body.blocked
            ? "blocked"
            : "dispatch failed",
      mode: typeof inject.body.mode === "string" ? inject.body.mode : null,
    });
  }

  return results;
}

export function formatMultiDispatchReply(
  attempts: DispatchAttempt[],
  intentLabel?: string,
): string {
  const ok = attempts.filter((a) => a.ok);
  const skipped = attempts.filter((a) => !a.ok);

  const lines = [
    intentLabel
      ? `Queued **${ok.length}** of **${attempts.length}** selected projects (${intentLabel}).`
      : `Queued **${ok.length}** of **${attempts.length}** selected projects.`,
  ];

  if (ok.length > 0) {
    lines.push("", "**Started:**", ...ok.map((a) => `- ${a.projectKey}`));
  }
  if (skipped.length > 0) {
    lines.push("", "**Skipped:**", ...skipped.map((a) => `- ${a.projectKey}${a.reason ? ` (${a.reason})` : ""}`));
  }
  lines.push("", "Watch progress on [Control](/control). You get a notification when each run finishes.");
  return lines.join("\n");
}
