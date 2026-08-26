/**
 * What a terminal failure means, and therefore what button to show next to it.
 *
 * /control rendered a Retry beside every failed command. For
 * "focus_tab -> orangecat failed: tab not found" that button is a lie: retrying
 * re-issues an identical command against a target that is identically absent,
 * so it fails identically, forever. One such banner sat on the page for 47
 * minutes across many clicks.
 *
 * A retry is only honest when repeating the SAME action could plausibly produce
 * a DIFFERENT result — a transient focus race, a busy zellij. When the cause is
 * "the thing you are aiming at does not exist", the useful action is to make it
 * exist, and offering Retry instead is how a surface teaches its user to
 * distrust it.
 *
 * SSOT note: these constants are the phrases `buildFocusError` composes its
 * messages FROM. They are matched here rather than re-typed, because a message
 * and a classifier that each spell the same sentence independently are two
 * definitions that drift the first time someone rewords the copy — and the
 * drift is silent, since a misclassified failure still renders a plausible
 * button.
 */

export const FOCUS_FAILURE_PHRASE = {
  /** Zellij itself isn't running — nothing to focus into. */
  NO_TERMINAL: "no zellij session is running on the connected computer",
  /** Zellij is up, but this project has no tab and no running agent. */
  NO_SUCH_TARGET: "no zellij tab with that name in any active session",
  /** The tab exists and was found; focus just didn't take in time. */
  FOCUS_TIMED_OUT: "focus did not take within",
} as const;

export const FAILURE_REMEDY = {
  /** Repeating the action can genuinely succeed. */
  RETRY: "retry",
  /** The project has no session — start one. */
  START_SESSION: "start_session",
  /** No terminal at all — the runner/zellij has to come up first. */
  START_TERMINAL: "start_terminal",
} as const;
export type FailureRemedy = (typeof FAILURE_REMEDY)[keyof typeof FAILURE_REMEDY];

/**
 * The remedy for a failure, from its error text.
 *
 * Defaults to RETRY on anything unrecognised. That is the deliberate direction
 * to be wrong in: an unnecessary Retry costs one wasted click, whereas hiding
 * Retry from a genuinely transient failure strands work with no way forward.
 */
export function remedyForFailure(error: string | null | undefined): FailureRemedy {
  const text = (error ?? "").toLowerCase();
  if (text.includes(FOCUS_FAILURE_PHRASE.NO_TERMINAL)) return FAILURE_REMEDY.START_TERMINAL;
  if (text.includes(FOCUS_FAILURE_PHRASE.NO_SUCH_TARGET)) return FAILURE_REMEDY.START_SESSION;
  return FAILURE_REMEDY.RETRY;
}
