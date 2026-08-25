/**
 * One directory, one metered run.
 *
 * Token spend is recovered by replaying an agent's Claude Code transcript over
 * a TIME WINDOW — `collectClaudeUsage(dir, from, to)`. The transcript is keyed
 * by directory, not by run, so the window is the only thing separating one
 * run's tokens from another's. When two runs meter the same directory with
 * overlapping windows they both sum the same assistant messages and the same
 * tokens are billed twice.
 *
 * That is not hypothetical. In prod on 2026-08-14 two orangecat runs reported
 * byte-identical totals and identical sessionIds at $1.7605 each, and on
 * 08-24 three runs sat open on one project for 109 minutes, each reporting a
 * window ending at the same instant. The reporter recomputes `[deliveredAt,
 * now]` every heartbeat, so any two entries alive at once on one directory
 * converge on the same answer.
 *
 * The fix is the same shape as every other attribution fix in this codebase:
 * stop asking "what happened while this run was open?" and use a fact about
 * THIS run. A newly delivered prompt in the same directory is that fact — it
 * is the runner's own local proof that the previous run's turn is over, so
 * that run's window ENDS there. No round trip, no clock comparison across two
 * machines, and it holds even when the close never arrives (the failure that
 * produced the 109-minute overlap).
 *
 * The trade this makes, stated plainly. Two prompts CAN reach one directory
 * while the first agent is still generating: the FIFO gate's blocker set is
 * itself time-windowed (`STALE_RUN_MINUTES`), so an open run stops blocking
 * after 60 minutes and the next prompt is typed into the same session. When
 * that happens the two runs' tokens are genuinely inseparable — one transcript,
 * one session, interleaved. Ending the older window credits the shared tail to
 * the NEWER prompt, which is the agent's actual current instruction, and can
 * under-report the older run. That is the right direction to be wrong in:
 * under-reporting one run is a smaller lie than reporting both runs' totals as
 * if each had spent the whole amount.
 */

export type MeteredEntry = {
  runId: string;
  dir: string;
  deliveredAtMs: number;
  /** Fixed upper bound once another run claims this directory. Absent means
   *  "still the current owner" — the window runs to now. */
  windowEndMs?: number;
};

/**
 * A new run took over `next.dir`. Close every OTHER window metering that same
 * directory at the new delivery instant.
 *
 * Narrowing only: an entry that already has an end keeps the earlier of the
 * two, so a repeated or out-of-order call can never widen a window back over
 * someone else's tokens. Entries delivered AFTER `next` are left alone — they
 * are the newer owner, and closing them would hand their tokens to an older
 * run.
 *
 * Mutates in place (the reporter's ledger holds the same objects) and returns
 * the ids it closed, for logging and tests.
 */
export function closeWindowsForDirectory(
  entries: Iterable<MeteredEntry>,
  next: Pick<MeteredEntry, "runId" | "dir" | "deliveredAtMs">,
): string[] {
  const closed: string[] = [];
  for (const prev of entries) {
    if (prev.runId === next.runId) continue;
    if (prev.dir !== next.dir) continue;
    if (prev.deliveredAtMs > next.deliveredAtMs) continue;
    prev.windowEndMs =
      prev.windowEndMs != null
        ? Math.min(prev.windowEndMs, next.deliveredAtMs)
        : next.deliveredAtMs;
    closed.push(prev.runId);
  }
  return closed;
}

/**
 * The instant this entry's usage window ends: its fixed bound if another run
 * has claimed the directory, otherwise `now`.
 *
 * Never returns less than `deliveredAtMs` — a zero-length window reports an
 * honest 0, which is the right answer for a run that was superseded before it
 * generated anything. Letting it go negative would make `collectClaudeUsage`
 * scan an inverted range and silently return 0 for a different reason.
 */
export function meteringWindowEnd(entry: MeteredEntry, now: number): number {
  const end = entry.windowEndMs ?? now;
  return Math.max(end, entry.deliveredAtMs);
}
