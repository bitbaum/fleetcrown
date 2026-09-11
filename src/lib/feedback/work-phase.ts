/**
 * Honest work-phase for visitor feedback — what the captain sees after
 * Implement. DB status stays new|dispatched|resolved|archived; this layer
 * answers: not started / queued / working / stuck / failed / needs verify / done.
 *
 * "Done" means the live product changed (operator Resolve, or later a live
 * stamp / merged PR). An agent run finishing — or injectPrompt delivering a
 * prompt — is not Done. "dispatched" alone is not a user-facing word either.
 */
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";
import { ORCH_STATE, type OrchestrationState } from "@/lib/orchestration/contract";
import { ORCHESTRATION_OUTCOME } from "@/lib/orchestration/contract";
import { EXECUTOR_COPY } from "@/config/executor-copy";
import { isRunProgressFresh, RUN_PROGRESS_FRESH_MS } from "@/lib/run-progress";

export const FEEDBACK_WORK_PHASE = {
  NOT_STARTED: "not_started",
  QUEUED: "queued",
  WORKING: "working",
  STUCK: "stuck",
  FAILED: "failed",
  /** Agent run closed ok — still waiting for live proof / operator Resolve. */
  NEEDS_VERIFY: "needs_verify",
  DONE: "done",
  ARCHIVED: "archived",
} as const;
export type FeedbackWorkPhase = (typeof FEEDBACK_WORK_PHASE)[keyof typeof FEEDBACK_WORK_PHASE];

export type FeedbackWorkView = {
  phase: FeedbackWorkPhase;
  /** Short status word for the badge — never "dispatched". */
  label: string;
  /** One line of what to do / what happened. Written for a human, always.
   *  Never a raw run error — see `diagnostic`. */
  detail: string | null;
  /**
   * The run's raw error, for a disclosure the reader opens on purpose.
   *
   * This used to BE `detail`, so whatever an executor happened to write went
   * straight onto the card as if it were advice to the user. On /control that
   * printed, verbatim and twice: "Corrected 2026-08-24: repo evidence in the
   * run window belonged to a sibling run; this run was acked verified:false
   * and never started." That is an engineer's note to another engineer. It
   * tells a person looking at their own feedback queue nothing they can act
   * on, and it is the kind of thing that makes a surface read as debug output
   * someone forgot to remove.
   *
   * Keeping it — behind a disclosure rather than deleted — because when a run
   * really did fail for a legible reason, that reason is the most useful text
   * on the row. The fix is where it renders, not whether.
   */
  diagnostic?: string | null;
  /**
   * There is a terminal worth opening: the prompt reached an agent PTY. The row
   * links "Watch" to Terminal when this is true and "Open on Control" when it
   * is not — Terminal is empty before a session exists, and sending a reader
   * there to watch nothing was the first thing that made the loop feel broken.
   */
  watchable?: boolean;
  /** When the agent started on it (delivery, else run start). ISO. */
  since?: string | null;
  /** Last runner heartbeat — the PTY printed something. ISO. */
  lastActivityAt?: string | null;
};

export type FeedbackRunSnapshot = {
  id: string;
  state: OrchestrationState;
  outcome: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  deliveredAt: string | null;
  /** payload.lastProgressAt — runner heartbeat, see src/lib/run-progress.ts. */
  lastProgressAt: string | null;
  error: string | null;
};

const STARTING_MS = 90_000;
/** Delivered, then silent for this long = the honest word is Stalled. One
 *  window, owned by the progress contract, so runner and reader agree. */
const THINKING_MS = RUN_PROGRESS_FRESH_MS;

/** "2 min" / "1 h 05 min" — how long the agent has been on it. Minutes only:
 *  a seconds counter on a list that polls every 8 s reads as jitter. */
export function workElapsedLabel(fromIso: string | Date, now = Date.now()): string {
  const from = typeof fromIso === "string" ? Date.parse(fromIso) : fromIso.getTime();
  const minutes = Math.max(0, Math.floor((now - from) / 60_000));
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
}

export function deriveFeedbackWork(
  status: FeedbackStatus,
  run: FeedbackRunSnapshot | null,
  now: number = Date.now(),
): FeedbackWorkView {
  if (status === FEEDBACK_STATUS.ARCHIVED) {
    return { phase: FEEDBACK_WORK_PHASE.ARCHIVED, label: "Archived", detail: null };
  }
  if (status === FEEDBACK_STATUS.RESOLVED) {
    return { phase: FEEDBACK_WORK_PHASE.DONE, label: "Done", detail: null };
  }
  if (status === FEEDBACK_STATUS.NEW) {
    // No detail. Every other phase's detail earns its line by carrying
    // something the badge cannot — an error string, a retry instruction,
    // where to watch. "No agent has been asked to fix this yet." carried
    // nothing: the badge already reads "Not started" and the row's only
    // button already reads "Implement". On a strip of five new items it
    // printed the same sentence five times, which is how a surface that is
    // supposed to say what needs you ends up mostly saying nothing.
    return {
      phase: FEEDBACK_WORK_PHASE.NOT_STARTED,
      label: "Not started",
      detail: null,
    };
  }

  // status === dispatched, but no run record. The run row is created BEFORE
  // the row flips to dispatched, so "no record" never means "still starting" —
  // it means run-create failed or the run was pruned. Calling this QUEUED made
  // it a phase with no exit: both surfaces polled it every 8s forever and the
  // QUEUED action set has no Retry. STUCK is the honest phase, and it carries
  // the Retry affordance.
  if (!run) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Not running",
      detail: "No run record for this fix — it isn't executing. Retry to queue it again.",
    };
  }

  const since = run.deliveredAt ?? run.startedAt.toISOString();
  if (run.state === ORCH_STATE.RUNNING) {
    return {
      phase: FEEDBACK_WORK_PHASE.WORKING,
      label: `Working · ${workElapsedLabel(since, now)}`,
      detail: `Agent is generating — Watch opens its terminal. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
      watchable: true,
      since,
      lastActivityAt: run.lastProgressAt,
    };
  }

  if (run.outcome === ORCHESTRATION_OUTCOME.UNCONFIRMED) {
    return {
      phase: FEEDBACK_WORK_PHASE.FAILED,
      label: "Never started",
      detail:
        "The prompt was injected but the agent was never seen picking it up. Nothing ran, so there is no result to read — retry it.",
      diagnostic: run.error?.slice(0, 400) ?? null,
    };
  }

  if (
    run.state === ORCH_STATE.ERROR ||
    run.outcome === ORCHESTRATION_OUTCOME.TIMEOUT ||
    run.outcome === ORCHESTRATION_OUTCOME.ERROR ||
    run.outcome === ORCHESTRATION_OUTCOME.HANG
  ) {
    return {
      phase: FEEDBACK_WORK_PHASE.FAILED,
      label: "Failed",
      detail: "The run ended without a successful fix. Retry or Watch Terminal.",
      diagnostic: run.error?.slice(0, 400) ?? null,
    };
  }

  if (
    run.state === ORCH_STATE.DONE ||
    run.state === ORCH_STATE.CLOSED ||
    run.state === ORCH_STATE.CLOSING
  ) {
    const ok =
      run.outcome === ORCHESTRATION_OUTCOME.SUCCESS ||
      run.outcome === ORCHESTRATION_OUTCOME.PARTIAL;
    if (ok) {
      // Not Done. SUCCESS/PARTIAL is the agent's claim that its session ended
      // well — not evidence the live UI changed. Done is only RESOLVED
      // (operator Resolve today; live stamp / merged PR later).
      return {
        phase: FEEDBACK_WORK_PHASE.NEEDS_VERIFY,
        label: "Check live",
        detail:
          run.outcome === ORCHESTRATION_OUTCOME.PARTIAL
            ? "Agent finished with partial success — confirm the live product changed, then Resolve."
            : "Agent finished — confirm the live product changed, then Resolve.",
      };
    }
    return {
      phase: FEEDBACK_WORK_PHASE.FAILED,
      label: "Failed",
      detail: "Run finished without success. Retry or Watch Terminal.",
      diagnostic: run.error?.slice(0, 400) ?? null,
    };
  }

  // waiting / idle — the ambiguous zone that previously read as success.
  const ageMs = now - run.startedAt.getTime();
  if (!run.deliveredAt && ageMs > STARTING_MS) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Not running",
      detail: "Queued, but no agent picked it up. Open Control — Retry if it stays.",
    };
  }
  if (!run.deliveredAt) {
    return {
      phase: FEEDBACK_WORK_PHASE.QUEUED,
      label: "Queued",
      detail: `Starting — waiting for the agent to pick it up. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
    };
  }
  // Delivered. From here the runner's heartbeat is the truth: it beats while
  // the agent's terminal keeps printing, and stops when it goes quiet. A run
  // that reports progress is Working for as long as it takes — an hour-long
  // fix used to flip to "Not running" at minute ten while the agent typed.
  if (isRunProgressFresh(run.lastProgressAt, now)) {
    return {
      phase: FEEDBACK_WORK_PHASE.WORKING,
      label: `Working · ${workElapsedLabel(since, now)}`,
      detail: `Agent output ${workElapsedLabel(run.lastProgressAt!, now)} ago — Watch opens its terminal. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
      watchable: true,
      since,
      lastActivityAt: run.lastProgressAt,
    };
  }
  if (run.lastProgressAt) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Stalled",
      detail: `Worked for ${workElapsedLabel(since, run.lastProgressAt ? Date.parse(run.lastProgressAt) : now)}, then nothing for ${workElapsedLabel(run.lastProgressAt, now)}. Watch its terminal — it may be waiting on you — or Retry.`,
      watchable: true,
      since,
      lastActivityAt: run.lastProgressAt,
    };
  }
  const sinceDeliveryMs = now - Date.parse(run.deliveredAt);
  if (sinceDeliveryMs > THINKING_MS) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Not running",
      detail: `Prompt delivered ${workElapsedLabel(run.deliveredAt, now)} ago, but the agent never reported any output. Watch its terminal, or Retry.`,
      watchable: true,
      since,
    };
  }
  return {
    phase: FEEDBACK_WORK_PHASE.WORKING,
    label: `Working · ${workElapsedLabel(since, now)}`,
    detail: `Prompt delivered — waiting for the first output. Watch opens its terminal. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
    watchable: true,
    since,
  };
}
