/**
 * Scheduled-dispatch eligibility — the SAME safety rails the Control page
 * enforces, sourced from persisted state so a cron can apply them.
 *
 * The bug this closes (2026-08-02): `evaluateDispatchGates` has always refused
 * to dispatch an agent that reported `status: working|blocked`, that has a
 * pending blocker file, or that is stuck in a no-op loop — but ONLY on the
 * /api/control/dispatch path, where a client posts the handoff. The nightly
 * autopilot cron (`crons/nudge-idle`) hand-rolled its own gate list and had
 * none of those, so every night it woke projects whose agents had explicitly
 * declared themselves unavailable. Those runs could not succeed by
 * construction: the agent correctly does nothing, never writes a fresh `ready`
 * handoff, and an hour later the reaper stamps the run partial/timeout. Over
 * the two weeks before this fix that single gap produced most of a 31/34
 * non-success rate, including a project whose handoff literally read "do not
 * re-invoke next_best on a plain schedule".
 *
 * The rails existed; the scheduled path just didn't use them — so the fix is
 * to route BOTH paths through one function rather than to write new checks.
 */

import type { AutoInjectMode } from "@/config/beacon";
import type { ProjectState } from "@/db/schema/project-states";
import { SESSION_STATUS } from "@/lib/constants/statuses";
import { MINUTE_MS } from "@/lib/constants/time";
import { evaluateDispatchGates, type GateInput } from "./dispatch-gates";
import type { DispatchResult } from "@/app/api/control/dispatch/route";

/**
 * How long an unattended `status: working` claim stays credible.
 *
 * `working` means "I am mid-turn, do not interrupt" — a LIVENESS claim, and
 * liveness claims expire (the same reasoning as `isRuntimeObservationFresh`).
 * An agent killed mid-turn leaves `working` written forever; without an expiry
 * the honest new gate would freeze that project out of autopilot permanently,
 * trading a loud failure for a silent one. Past this age with no live agent
 * process, the claim is treated as unknown and the project is dispatchable
 * again.
 *
 * `blocked` deliberately does NOT expire: it is a standing DECISION about the
 * world ("waiting on a human to merge PR #7"), not a claim about a running
 * process, and it is cleared when the agent next reports anything else.
 */
export const WORKING_CLAIM_TTL_MS = 60 * MINUTE_MS;

/**
 * The status a scheduler should act on — the reported one, except that a STALE
 * `working` claim with no live agent process decays to unknown. See
 * WORKING_CLAIM_TTL_MS for why `blocked` is exempt.
 */
function effectiveStatus(
  state: Pick<ProjectState, "sessionStatus" | "agentRunning" | "sessionUpdatedAt"> | null,
  nowMs: number,
): string {
  const status = state?.sessionStatus ?? "";
  if (status !== SESSION_STATUS.WORKING) return status;
  if (state?.agentRunning) return status; // a process really is running — honor it
  const writtenMs = state?.sessionUpdatedAt?.getTime();
  if (writtenMs != null && nowMs - writtenMs > WORKING_CLAIM_TTL_MS) return "";
  return status;
}

/**
 * Project a persisted `project_states` row into the SSOT gate input.
 *
 * `blockerCount` is deliberately absent: pending blocker FILES live on the
 * runner's disk and are only ever reported by a client posting to
 * /api/control/dispatch, so a server-side scheduler cannot observe them. It is
 * passed as 0 (not gated) rather than guessed — and in practice the status gate
 * already covers the real cases, because an agent that stops for a blocker
 * reports `working`/`blocked` in the same handoff that raises it.
 */
export function gateInputFromState(
  state: Pick<
    ProjectState,
    "sessionStatus" | "sessionNoOpCount" | "promptQueue" | "agentRunning" | "sessionUpdatedAt"
  > | null,
  opts: {
    mode: AutoInjectMode;
    recentOutcomes: string[];
    streakSuffix?: string;
    /** Injectable for tests. */
    nowMs?: number;
  },
): GateInput {
  return {
    // Missing row / legacy null = unknown, treated permissively as ready — the
    // same convention the dispatch route's HandoffSchema uses for an empty
    // status. A project the runner has never described must stay dispatchable.
    status: effectiveStatus(state, opts.nowMs ?? Date.now()),
    blockerCount: 0,
    noOpCount: state?.sessionNoOpCount ?? 0,
    mode: opts.mode,
    queueLength: state?.promptQueue?.length ?? 0,
    streakSuffix: opts.streakSuffix ?? "",
    recentOutcomes: opts.recentOutcomes,
  };
}

/**
 * May a scheduler dispatch this project right now? Returns the SSOT gate
 * decision; callers dispatch only when `action !== "off"`.
 *
 * The queue-vs-nextbest distinction in the returned action is meaningful only
 * to the Control path — the idle nudger fires `next_best` by design — but the
 * real queue length is still passed so the decision is made on true inputs.
 */
export function evaluateScheduledDispatch(
  state: Parameters<typeof gateInputFromState>[0],
  opts: Parameters<typeof gateInputFromState>[1],
): DispatchResult | null {
  return evaluateDispatchGates(gateInputFromState(state, opts));
}
