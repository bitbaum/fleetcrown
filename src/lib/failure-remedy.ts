/**
 * What a failed runner command means, and therefore what button to show.
 *
 * /control once rendered Retry beside every failure. For "no running agent"
 * that button is a lie: the target is identically absent on every attempt, so
 * it fails identically, forever. A retry is only honest when repeating the
 * same action could plausibly produce a different result.
 *
 * SSOT note: the phrases here are the ones the runner composes its errors
 * FROM (desktop/src/main/poller.ts). scripts/test/failure-message-pairing.ts
 * reads the runner's throws and asserts each one is recognised, so a reworded
 * message on either side fails a test instead of drawing the wrong button.
 */
export const FAILURE_PHRASE = {
  /** The tab has no owned agent PTY on that runner; a dispatch starts one. */
  NO_RUNNING_AGENT: "no running agent for",
} as const;

export const FAILURE_REMEDY = {
  /** Start a session for the tab; then the command can run. */
  START_SESSION: "start-session",
  /** Repeating the same command could succeed (transient). */
  RETRY: "retry",
} as const;
export type FailureRemedy = (typeof FAILURE_REMEDY)[keyof typeof FAILURE_REMEDY];

export function remedyForFailure(error: string | null | undefined): FailureRemedy {
  const text = (error ?? "").toLowerCase();
  if (text.includes(FAILURE_PHRASE.NO_RUNNING_AGENT)) return FAILURE_REMEDY.START_SESSION;
  return FAILURE_REMEDY.RETRY;
}
