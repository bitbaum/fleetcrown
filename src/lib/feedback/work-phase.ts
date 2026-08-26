/**
 * Honest work-phase for visitor feedback — what the captain sees after
 * Dispatch. DB status stays new|dispatched|resolved|archived; this layer
 * answers: not started / queued / working / stuck / failed / done.
 *
 * "dispatched" alone is not a user-facing word — it lied by sounding finished.
 */
import { FEEDBACK_STATUS, type FeedbackStatus } from "@/lib/constants/statuses";
import { ORCH_STATE, type OrchestrationState } from "@/lib/orchestration/contract";
import { ORCHESTRATION_OUTCOME } from "@/lib/orchestration/contract";
import { EXECUTOR_COPY } from "@/config/executor-copy";

export const FEEDBACK_WORK_PHASE = {
  NOT_STARTED: "not_started",
  QUEUED: "queued",
  WORKING: "working",
  STUCK: "stuck",
  FAILED: "failed",
  DONE: "done",
  ARCHIVED: "archived",
} as const;
export type FeedbackWorkPhase = (typeof FEEDBACK_WORK_PHASE)[keyof typeof FEEDBACK_WORK_PHASE];

export type FeedbackWorkView = {
  phase: FeedbackWorkPhase;
  /** Short status word for the badge — never "dispatched". */
  label: string;
  /** One line of what to do / what happened. */
  detail: string | null;
};

export type FeedbackRunSnapshot = {
  id: string;
  state: OrchestrationState;
  outcome: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  deliveredAt: string | null;
  error: string | null;
};

const STARTING_MS = 90_000;
const THINKING_MS = 10 * 60_000;

export function deriveFeedbackWork(
  status: FeedbackStatus,
  run: FeedbackRunSnapshot | null,
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

  if (run.state === ORCH_STATE.RUNNING) {
    return {
      phase: FEEDBACK_WORK_PHASE.WORKING,
      label: "Working now",
      detail: `Agent is generating. Watch Terminal for live output. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
    };
  }

  if (run.state === ORCH_STATE.ERROR || run.outcome === ORCHESTRATION_OUTCOME.TIMEOUT
    || run.outcome === ORCHESTRATION_OUTCOME.ERROR || run.outcome === ORCHESTRATION_OUTCOME.HANG) {
    return {
      phase: FEEDBACK_WORK_PHASE.FAILED,
      label: "Failed",
      detail: run.error?.slice(0, 160) || "The run ended without a successful fix. Retry or Watch Terminal.",
    };
  }

  if (run.state === ORCH_STATE.DONE || run.state === ORCH_STATE.CLOSED || run.state === ORCH_STATE.CLOSING) {
    const ok = run.outcome === ORCHESTRATION_OUTCOME.SUCCESS || run.outcome === ORCHESTRATION_OUTCOME.PARTIAL;
    if (ok) {
      return {
        phase: FEEDBACK_WORK_PHASE.DONE,
        label: "Done",
        detail: "Run finished — click Resolve if the fix looks right.",
      };
    }
    return {
      phase: FEEDBACK_WORK_PHASE.FAILED,
      label: "Failed",
      detail: run.error?.slice(0, 160) || "Run finished without success. Retry or Watch Terminal.",
    };
  }

  // waiting / idle — the ambiguous zone that previously read as success
  const ageMs = Date.now() - run.startedAt.getTime();
  if (!run.deliveredAt && ageMs > STARTING_MS) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Not running",
      detail: "Queued, but the agent never started generating. Open Control — Retry if it stays.",
    };
  }
  if (!run.deliveredAt) {
    return {
      phase: FEEDBACK_WORK_PHASE.QUEUED,
      label: "Queued",
      detail: `Starting — waiting for the agent to pick it up. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
    };
  }
  if (ageMs > THINKING_MS) {
    return {
      phase: FEEDBACK_WORK_PHASE.STUCK,
      label: "Not running",
      detail: "Prompt was delivered, but there is no live progress. Open Control.",
    };
  }
  return {
    phase: FEEDBACK_WORK_PHASE.WORKING,
    label: "Working now",
    detail: `Prompt delivered — agent may still be thinking. Watch Terminal. ${EXECUTOR_COPY.honesty.notificationWhenDone}`,
  };
}
