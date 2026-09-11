/**
 * Run progress — the one signal that says "the agent is still working".
 *
 * A dispatch produced exactly three run events for a whole day of work:
 * dispatched, submitted, closed. Between "submitted" and "closed" — typically
 * 20–60 minutes — nothing was written anywhere, so every surface that read the
 * run (Feedback, Control) had to guess, and guessed "Queued", then "Not
 * running", while the agent was in fact busy. The runner owns the agent's PTY
 * and sees every byte it prints; that is the source of truth, and this module
 * is the contract between the runner that reports it and the surfaces that
 * read it.
 *
 * The runner beats at most once per RUN_PROGRESS_BEAT_MS, and only when the
 * PTY printed something since the last beat — a silent agent produces no
 * beats, so "no progress for RUN_PROGRESS_FRESH_MS" honestly means stalled.
 */
export const RUN_PROGRESS_BEAT_MS = 45_000;
/** A beat older than this no longer proves life: the phase turns from
 *  Working to Stalled. Same window the feedback phase always used for
 *  "prompt delivered, but nothing since". */
export const RUN_PROGRESS_FRESH_MS = 10 * 60_000;
/** Belt and braces: a run that keeps printing for longer than this is a
 *  runaway; the runner stops beating and the phase turns Stalled, which is
 *  the honest state for something a human has to look at. */
export const RUN_PROGRESS_MAX_MS = 6 * 60 * 60_000;

export type RunProgressBeat = {
  /** PTY bytes printed since the previous beat. */
  outputBytes: number;
  /** When the PTY last printed anything (ISO). */
  lastOutputAt: string;
};

export function isRunProgressFresh(
  lastProgressAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastProgressAt) return false;
  const t = Date.parse(lastProgressAt);
  if (Number.isNaN(t)) return false;
  return now - t < RUN_PROGRESS_FRESH_MS;
}

/** Pure decision the runner's timer makes on every tick. */
export function shouldBeat(
  s: { bytesSinceBeat: number; lastBeatAt: number; startedAt: number },
  now = Date.now(),
): "beat" | "wait" | "stop" {
  if (now - s.startedAt > RUN_PROGRESS_MAX_MS) return "stop";
  if (s.bytesSinceBeat <= 0) return "wait";
  if (now - s.lastBeatAt < RUN_PROGRESS_BEAT_MS) return "wait";
  return "beat";
}
