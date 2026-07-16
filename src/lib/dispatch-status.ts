import { EXECUTOR_COPY } from "@/config/executor-copy";
import type { StatusTone } from "@/lib/constants/statuses";

export type DispatchStatusInput = {
  ok?: boolean;
  mode?: string | null;
  warning?: string | null;
  runnerConnected?: boolean | null;
};

/** SSOT for dispatch outcome copy — Loki footer, Control toasts, etc. */
export function dispatchStatusLabel(input: DispatchStatusInput): { label: string; warn: boolean } {
  if (input.ok === false) {
    return { label: "Dispatch failed", warn: true };
  }
  if (input.warning === "runner-offline" || (input.mode === "queued" && input.runnerConnected === false)) {
    return { label: EXECUTOR_COPY.queuedWhenOffline, warn: true };
  }
  if (input.mode === "direct") {
    return { label: "Running now", warn: false };
  }
  if (input.mode === "queued") {
    return { label: EXECUTOR_COPY.queuedWithBuilderOnline, warn: false };
  }
  return { label: "Dispatched", warn: false };
}

export function dispatchAssistantContent(
  projectKey: string,
  input: DispatchStatusInput,
): string {
  if (input.ok === false) {
    return `Could not dispatch to ${projectKey}.`;
  }
  const { label, warn } = dispatchStatusLabel(input);
  if (input.mode === "direct") {
    return `Running on **${projectKey}** in the agent terminal now.`;
  }
  if (input.mode === "queued" && !warn) {
    return `Dispatched **${projectKey}** — ${EXECUTOR_COPY.queuedWithBuilderOnlineLong}`;
  }
  if (warn) {
    return `Queued **${projectKey}** — ${EXECUTOR_COPY.queuedWhenOfflineLong}`;
  }
  void label;
  return `Dispatched **${projectKey}**.`;
}

/** The live lifecycle of a queued dispatch, derived from its pending_command
 *  row. Lets the transcript footer show the truth as it unfolds — queued →
 *  picked up → ran / failed — instead of freezing on the optimistic snapshot
 *  stamped at dispatch time. SSOT for both the status API and the footer. */
export type DispatchLiveStatus =
  | "queued"
  | "working"
  | "delivered"
  | "completed"
  | "partial"
  | "stopped"
  | "unconfirmed"
  | "failed";

export type CommandLiveInput = {
  claimedAt: string | Date | null;
  executedAt: string | Date | null;
  result: {
    ok?: boolean | null;
    verified?: boolean | null;
    warning?: string | null;
    error?: string | null;
  } | null;
  run?: {
    state: string;
    outcome: string | null;
    payload?: { error?: string } | null;
  } | null;
};

export type DispatchLiveView = {
  status: DispatchLiveStatus;
  label: string;
  detail: string | null;
  tone: StatusTone;
  /** true once the command reached a settled state — the footer stops polling. */
  terminal: boolean;
};

export function deriveDispatchLiveStatus(cmd: CommandLiveInput): DispatchLiveView {
  const r = cmd.result ?? {};
  if (!cmd.executedAt) {
    if (!cmd.claimedAt) {
      return { status: "queued", label: "Queued", detail: "waiting for a builder to pick it up", tone: "neutral", terminal: false };
    }
    return { status: "working", label: "Agent picked up — working", detail: "running your prompt now", tone: "positive", terminal: false };
  }
  if (r.ok === false) {
    return { status: "failed", label: "Dispatch failed", detail: r.error ?? "the agent could not run", tone: "negative", terminal: true };
  }
  if (r.verified === false) {
    return { status: "unconfirmed", label: "Delivered — not confirmed", detail: r.warning ?? "the agent hasn't confirmed it started generating", tone: "warning", terminal: true };
  }

  const run = cmd.run;
  if (!run) {
    return {
      status: "delivered",
      label: "Delivered to agent",
      detail: "the runner confirmed the prompt was submitted",
      tone: "positive",
      terminal: true,
    };
  }

  if (run.state === "waiting") {
    return {
      status: "delivered",
      label: "Delivered to agent",
      detail: "waiting for a completion handoff",
      tone: "positive",
      terminal: false,
    };
  }
  if (run.state === "running" || run.state === "closing") {
    return {
      status: "working",
      label: run.state === "closing" ? "Agent is finishing" : "Agent is working",
      detail: "the tracked run is still open",
      tone: "positive",
      terminal: false,
    };
  }

  const error = run.payload?.error?.trim() || null;
  switch (run.outcome) {
    case "success":
      return { status: "completed", label: "Completed", detail: "successful outcome recorded", tone: "positive", terminal: true };
    case "partial":
      return { status: "partial", label: "Finished with follow-up", detail: "the run recorded remaining work", tone: "warning", terminal: true };
    case "user_abort":
      return { status: "stopped", label: "Stopped by you", detail: null, tone: "neutral", terminal: true };
    case "hang":
      return { status: "failed", label: "Agent stopped responding", detail: error, tone: "negative", terminal: true };
    case "timeout":
      return { status: "failed", label: "Run timed out", detail: error, tone: "negative", terminal: true };
    case "error":
      return { status: "failed", label: "Run failed", detail: error, tone: "negative", terminal: true };
    default:
      return {
        status: "unconfirmed",
        label: "Run closed — outcome missing",
        detail: "check Activity for the recorded evidence",
        tone: "warning",
        terminal: true,
      };
  }
}
