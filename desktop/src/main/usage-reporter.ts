/**
 * Per-run token usage reporter (runner side).
 *
 * The runner host is the only place agent token spend exists (Claude Code
 * transcripts under ~/.claude/projects — see lib/usage/claude-transcript-
 * usage.ts). This module keeps a small in-memory ledger of delivered runs
 * (poller.ts calls trackRunUsage after a verified inject ack) and, on the
 * runner heartbeat cadence, recomputes each run's cumulative usage window
 * [deliveredAt, now] and POSTs it to the control plane, which prices it and
 * stamps the run row.
 *
 * Reports REPLACE, never increment — a lost POST or missed tick costs
 * nothing. The cloud answers `done: true` once the run is closed and its
 * usage frozen; that (or a 12h age cap) drops the entry. Ledger is
 * in-memory by design: a runner restart forgets in-flight runs, whose
 * post-close report is then simply never sent — tokens missing, never
 * wrong. Same trade the pusher makes.
 */
import { collectClaudeUsage } from "@/lib/usage/claude-transcript-usage";
import { closeWindowsForDirectory, meteringWindowEnd } from "@/lib/usage/metering-window";
import { RUNNER_HEARTBEAT_MS } from "@/lib/constants/runner";
import { APP_URL } from "@/config/brand";
import { loadToken } from "./token-store";

const BASE_URL = (process.env.FLEETCROWN_WEB_URL || "").trim() || APP_URL;
const REPORT_INTERVAL_MS = RUNNER_HEARTBEAT_MS;
const MAX_TRACK_AGE_MS = 12 * 60 * 60 * 1000;
const POST_TIMEOUT_MS = 12_000;

type TrackedRun = {
  runId: string;
  dir: string;
  deliveredAtMs: number;
  /** Fixed once another run claims this directory — see metering-window.ts. */
  windowEndMs?: number;
  /** Set once we've warned that no transcript exists under `dir`, so a genuine
   *  misconfiguration is audible without the retry loop shouting every tick. */
  warnedNoTranscript?: boolean;
};

const ledger = new Map<string, TrackedRun>();
let timer: NodeJS.Timeout | null = null;

/** Start tracking a delivered run. Lazily starts the report timer; the timer
 *  stops itself when the ledger drains, so no index.ts/box-runner wiring. */
export function trackRunUsage(entry: TrackedRun): void {
  // This delivery is proof the previous run's turn on `dir` is over. Close its
  // window here, or both runs recompute [own delivery, now] over ONE shared
  // transcript and bill the same tokens twice. See metering-window.ts.
  const closed = closeWindowsForDirectory(ledger.values(), entry);
  if (closed.length) {
    console.log(
      `[usage] ${entry.runId.slice(0, 8)} took over ${entry.dir} — froze window for ` +
        closed.map((id) => id.slice(0, 8)).join(", "),
    );
  }
  ledger.set(entry.runId, entry);
  if (!timer) {
    timer = setInterval(() => {
      void reportAll();
    }, REPORT_INTERVAL_MS);
    timer.unref?.();
  }
}

export function stopUsageReporter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  ledger.clear();
}

/** Exposed for tests and for a future close-triggered flush. */
export async function reportAll(now = Date.now()): Promise<void> {
  const token = loadToken();
  if (!token) return;
  for (const entry of [...ledger.values()]) {
    if (now - entry.deliveredAtMs > MAX_TRACK_AGE_MS) {
      ledger.delete(entry.runId);
      continue;
    }
    try {
      const windowTo = meteringWindowEnd(entry, now);
      const usage = collectClaudeUsage(entry.dir, entry.deliveredAtMs, windowTo);
      // No transcript dir yet (agent still booting) — keep tracking, retry
      // next tick. Zero-usage windows still report: an honest 0 beats null.
      if (!usage) {
        // …but say so once. This branch is also what a MISCONFIGURED dir looks
        // like, and its silence is why #145 went a full day unnoticed: every
        // run tracked the dispatch's laptop path, no transcript could ever
        // match it, and the reporter skipped without a word. A metering path
        // that fails quietly reads exactly like a fleet that spent nothing.
        if (!entry.warnedNoTranscript) {
          entry.warnedNoTranscript = true;
          console.warn(
            `[usage] no Claude transcript under ${entry.dir} for run ${entry.runId.slice(0, 8)} — ` +
              `still retrying; if this persists the tracked dir is wrong, not the agent slow.`,
          );
        }
        continue;
      }
      const resp = await fetch(`${BASE_URL}/api/orchestration/runs/${entry.runId}/usage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          totals: usage.totals,
          models: usage.models,
          sessionIds: usage.sessionIds.slice(0, 20),
          windowTo: new Date(windowTo).toISOString(),
        }),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
        // Dead token or vanished run — retrying is pointless for this entry.
        ledger.delete(entry.runId);
        continue;
      }
      if (resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { done?: boolean };
        if (body.done) ledger.delete(entry.runId);
      }
      // Other non-ok (5xx, network hiccup below) — keep the entry, next tick retries.
    } catch (e) {
      console.warn(
        `[usage-reporter] report failed for run ${entry.runId.slice(0, 8)}: ${(e as Error).message}`,
      );
    }
  }
  if (ledger.size === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
}
