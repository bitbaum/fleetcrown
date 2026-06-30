import { EXECUTOR_COPY } from "@/config/executor-copy";
import type { RunnerStateKey } from "@/lib/control-states";

export type BuilderChannelPresence = {
  cloud: boolean;
  local: boolean;
  any: boolean;
};

/** True when the last runtime-state push came from the headless box-runner. */
export function isCloudRunnerVersion(version: string | null | undefined): boolean {
  if (!version) return false;
  return version.startsWith("box-") || version.startsWith("box/");
}

/** Infer channel presence from legacy signals when DB columns are absent. */
export function inferBuilderChannelPresence(input: {
  connected: boolean;
  cloudConnected?: boolean | null;
  localConnected?: boolean | null;
  runnerVersion?: string | null;
}): BuilderChannelPresence {
  const cloud = input.cloudConnected ?? (input.connected && isCloudRunnerVersion(input.runnerVersion));
  const local = input.localConnected ?? (input.connected && !isCloudRunnerVersion(input.runnerVersion));
  return { cloud: !!cloud, local: !!local, any: !!(cloud || local) };
}

/** Compact fleet-header label — cloud vs this-computer, including dual state. */
export function builderCompactLabel(
  stateKey: RunnerStateKey,
  runnerVersion?: string | null,
  channels?: Pick<BuilderChannelPresence, "cloud" | "local"> | null,
): string {
  if (stateKey === "connected") {
    const cloud = channels?.cloud ?? isCloudRunnerVersion(runnerVersion);
    const local = channels?.local ?? (!!runnerVersion && !isCloudRunnerVersion(runnerVersion));

    if (cloud && local) return EXECUTOR_COPY.builder.bothOnline;
    if (cloud) return EXECUTOR_COPY.builder.cloudOnline;
    if (local) return EXECUTOR_COPY.builder.localComputerOnline;
    if (runnerVersion) return EXECUTOR_COPY.builder.online;
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

/** Detail line under the compact label — which builder is missing when partially offline. */
export function builderPresenceDetail(channels: BuilderChannelPresence): string | null {
  if (channels.cloud && channels.local) return null;
  if (channels.cloud && !channels.local) return EXECUTOR_COPY.builder.cloudOnlyDetail;
  if (!channels.cloud && channels.local) return EXECUTOR_COPY.builder.localOnlyDetail;
  return null;
}
