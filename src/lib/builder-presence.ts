import { EXECUTOR_COPY } from "@/config/executor-copy";
import type { RunnerStateKey } from "@/lib/control-states";

/** True when the last runtime-state push came from the headless box-runner. */
export function isCloudRunnerVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  return version.startsWith("box-") || version.startsWith("box/");
}

/** Compact fleet-header label — cloud vs this-computer when we can tell. */
export function builderCompactLabel(
  stateKey: RunnerStateKey,
  runnerVersion?: string | null,
): string {
  if (stateKey === "connected") {
    if (isCloudRunnerVersion(runnerVersion)) return EXECUTOR_COPY.builder.cloudOnline;
    if (runnerVersion) return EXECUTOR_COPY.builder.localComputerOnline;
    return EXECUTOR_COPY.builder.online;
  }
  const map: Record<RunnerStateKey, string> = {
    setup_needed: EXECUTOR_COPY.builder.setupOptional,
    offline: EXECUTOR_COPY.builder.offline,
    state_unknown: EXECUTOR_COPY.builder.uncertain,
    connected: EXECUTOR_COPY.builder.online,
  };
  return map[stateKey];
}
