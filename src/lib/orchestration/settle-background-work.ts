/**
 * Give `void`-dispatched work a moment to finish before a short-lived process
 * exits.
 *
 * Closing a run calls `notifyRunClosed` as `void` — its contract is never to
 * slow a close — and that call is what writes the outcome turn into the
 * conversation that asked for the work. A web server outlives such a promise
 * for free. A 45-second cron tick does not: on 2026-09-15 a hosted dispatch
 * ran, closed `success`, and its thread never heard, because `process.exit(0)`
 * fired first. The process boundary owes what the server gives away.
 *
 * A fixed window, not a promise registry, and the trade is deliberate: the
 * void-call is this codebase's convention at dozens of sites, so a registry
 * would mean threading bookkeeping through all of them to repair one boundary.
 * The cost is paid once per tick that actually did work, and it is a wait, not
 * a guarantee — work slower than the window is still lost, which is why the
 * window is generous relative to a database round trip and the caller skips it
 * when it drained nothing.
 */
export const BACKGROUND_DRAIN_MS = 5_000;

export async function settleBackgroundWork(
  ms: number = Number(process.env.HOSTED_RUNNER_DRAIN_MS ?? BACKGROUND_DRAIN_MS),
  sleep: (ms: number) => Promise<void> = (d) => new Promise((r) => setTimeout(r, d)),
): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) return;
  await sleep(ms);
}
