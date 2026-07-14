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
export type DispatchLiveStatus = "queued" | "working" | "ran" | "unconfirmed" | "failed";

export type CommandLiveInput = {
  claimedAt: string | Date | null;
  executedAt: string | Date | null;
  result: {
    ok?: boolean | null;
    verified?: boolean | null;
    warning?: string | null;
    error?: string | null;
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
  return { status: "ran", label: "Agent is running it", detail: "the prompt is live in the agent session", tone: "positive", terminal: true };
}
