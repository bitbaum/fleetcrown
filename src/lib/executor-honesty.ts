import { EXECUTOR_COPY } from "@/config/executor-copy";

export type ExecutorHonestyKind =
  | "queued"
  | "needs-builder"
  | "needs-github"
  | "needs-gateway"
  | "builder-starting";

export interface ExecutorHonestyLabel {
  kind: ExecutorHonestyKind;
  label: string;
  title: string;
}

export type ExecutorHonestyInput = {
  /** Cloud and/or desktop builder connected (from bridge presence). */
  runnerConnected: boolean | null;
  /** True when this machine hosts zellij / local runtime. */
  runtimeAvailable?: boolean;
  /** Action requires linked GitHub repo / CI. */
  needsGitHub?: boolean;
  /** Loki chat path needs OpenClaw gateway (not Groq fallback). */
  needsGateway?: boolean;
};

/** SSOT for short honesty chips on Control / Loki / Terminal actions. */
export function deriveExecutorHonestyLabel(
  input: ExecutorHonestyInput,
): ExecutorHonestyLabel | null {
  if (input.needsGateway) {
    return {
      kind: "needs-gateway",
      label: EXECUTOR_COPY.honesty.needsGateway,
      title: "Loki brain runs on the OpenClaw gateway. Without it, chat may fall back to Groq or show unavailable.",
    };
  }
  if (input.needsGitHub) {
    return {
      kind: "needs-github",
      label: EXECUTOR_COPY.honesty.needsGitHub,
      title: "Link this project to a GitHub repo in Projects before this action can run.",
    };
  }
  if (input.runtimeAvailable) {
    return null;
  }
  if (input.runnerConnected === true) {
    return {
      kind: "builder-starting",
      label: EXECUTOR_COPY.honesty.builderStarting,
      title: EXECUTOR_COPY.queuedWithBuilderOnlineLong,
    };
  }
  if (input.runnerConnected === false || input.runnerConnected === null) {
    return {
      kind: "needs-builder",
      label: EXECUTOR_COPY.honesty.needsBuilder,
      title: EXECUTOR_COPY.queuedWhenOfflineLong,
    };
  }
  return {
    kind: "queued",
    label: EXECUTOR_COPY.honesty.queued,
    title: EXECUTOR_COPY.queuedWhenOfflineLong,
  };
}
