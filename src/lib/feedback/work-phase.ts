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
    return {
      phase: FEEDBACK_WORK_PHASE.NOT_STARTED,
      label: "Not started",
      detail: "No agent has been asked to fix this yet.",
    };
  }

  // status === dispatched
  if (!run) {
    return {
      phase: FEEDBACK_WORK_PHASE.QUEUED,
      label: "Queued",
      detail: "Prompt accepted — no run record yet. Watch Control or Activity.",
    };
  }

  if (run.state === ORCH_STATE.RUNNING) {
    return {
      phase: FEEDBACK_WORK_PHASE.WORKING,
      label: "Working now",
      detail: "Agent is generating. Watch Terminal for live output. You get a notification when the run finishes.",
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
      detail: "Starting — waiting for the agent to pick it up. You get a notification when the run finishes.",
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
    detail: "Prompt delivered — agent may still be thinking. Watch Terminal. You get a notification when the run finishes.",
  };
}
