import { EXECUTOR_COPY } from "@/config/executor-copy";

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
