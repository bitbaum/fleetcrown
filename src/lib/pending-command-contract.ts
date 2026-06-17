export const PENDING_COMMAND_TYPES = [
  "inject",
  // Atomic "make it happen" command: ensure the project's zellij tab exists,
  // launch the agent there if one isn't already running, then inject the
  // prompt — verified, in one runner-side step. This is the reliable product
  // loop (explicit user dispatch); `inject` alone assumes an agent is already
  // up, which silently no-ops when it isn't.
  "dispatch",
  "focus_tab",
  "close_tab",
  "launch_agent",
  "switch_agent",
  "auto_continue",
  "install_cli",
  "peek_tab",
  // Live terminal (docs/architecture/embedded-terminal.md): start/stop a
  // dump-screen poll loop for a tab and stream changed frames to the cloud.
  "peek_start",
  "peek_stop",
  "transcribe",
  "repair_helper",
] as const;

export type PendingCommandType = (typeof PENDING_COMMAND_TYPES)[number];

export const FLEET_RUNNER_COMMAND_TYPES = [
  "inject",
  "dispatch",
  "focus_tab",
  "close_tab",
  "launch_agent",
  "switch_agent",
  "auto_continue",
  "install_cli",
  "peek_tab",
  "peek_start",
  "peek_stop",
] as const satisfies readonly PendingCommandType[];

export type FleetRunnerCommandType = (typeof FLEET_RUNNER_COMMAND_TYPES)[number];

export const FLEET_RUNNER_COMMAND_TYPES_PARAM = FLEET_RUNNER_COMMAND_TYPES.join(",");

export function isFleetRunnerCommandType(type: string): type is FleetRunnerCommandType {
  return (FLEET_RUNNER_COMMAND_TYPES as readonly string[]).includes(type);
}
