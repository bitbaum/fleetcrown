/**
 * @deprecated Renamed to ./runner. This re-export shim exists ONLY so the
 * desktop Fleet Runner (Electron) build — whose `@` alias may still resolve
 * `@/lib/constants/daemon` until it is updated in lockstep — keeps compiling.
 * New web-side code must import from "@/lib/constants/runner". Remove this
 * file once the desktop build points at the runner path.
 */
export {
  RUNNER_HEARTBEAT_MS,
  RUNNER_HEARTBEAT_MS as DAEMON_HEARTBEAT_MS,
  RUNNER_OFFLINE_THRESHOLD_MS,
  RUNNER_OFFLINE_THRESHOLD_MS as DAEMON_OFFLINE_THRESHOLD_MS,
  RUNNER_LONG_POLL_SECONDS,
  RUNNER_LONG_POLL_SECONDS as DAEMON_LONG_POLL_SECONDS,
  RUNNER_LONG_POLL_MS,
  RUNNER_LONG_POLL_MS as DAEMON_LONG_POLL_MS,
} from "./runner";
