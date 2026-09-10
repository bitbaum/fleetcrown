/**
 * Whether Implement/inject actually accepted a tracked run.
 *
 * injectPrompt can answer 200/ok when it refused (user typing) or when
 * run-create failed — those must not flip feedback to Queued/Working.
 */
export function feedbackInjectAccepted(
  status: number,
  body: { runId?: unknown; blocked?: unknown },
): body is { runId: string; blocked?: unknown } {
  return status < 400 && !body.blocked && typeof body.runId === "string" && body.runId.length > 0;
}
