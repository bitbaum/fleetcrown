/**
 * Pure derivations from a project's SessionState (the YAML-ish handoff the
 * agent itself writes to ~/.fleetcrown/sessions/<project>.md). The shape is
 * already flowed end-to-end:
 *
 *   agent writes session.md
 *   → desktop control-fast-state.readFastState parses it
 *   → desktop pusher.ts POSTs sessionStatus/sessionDone/sessionHealth/…
 *   → /api/control/runtime-state stores it
 *   → ControlData.projects[i].session reaches the React layer
 *
 * Until 2026-06-08 the React layer rendered exactly one fact from this:
 * "working vs ready" (via project.currentPrompt, not even session.status).
 * The OC no-op spiral that day showed why that's not enough — an agent
 * stuck in `status: ready` with `done: No-op turn #21` looked identical
 * to a genuinely idle project. These helpers derive the two states the
 * chips need:
 *
 *   - awaitingUser: agent is blocked on a human action (OAuth, deploy,
 *     credential) — firing the loop again wastes tokens
 *   - looping:      agent's last `done:` line matches the no-op pattern,
 *     with the count parsed out of the agent's own `No-op turn #N.` text
 *
 * Both are content-sniffed because the session.md format is a free-text
 * convention, not a schema. If the convention tightens later (e.g., a
 * dedicated `awaiting_user: true` field), update the helpers — the
 * consumer call sites already encode the intent.
 */

import type { SessionState } from "@/lib/control-types";
import { SESSION_STATUS } from "@/lib/constants/statuses";

/**
 * Read `noOpCount` from the structured field if the agent wrote one; otherwise
 * sniff `done: No-op turn #N.` for back-compat with pre-2026-06-08 sessions.
 * Returns null when neither source has a value.
 *
 *   structured field 5     → 5
 *   "No-op turn #21" only  → 21 (legacy path)
 *   "Fixed the bug"        → null
 *
 * The split-source contract is intentional: agents that emit `no-op-count:`
 * win unconditionally — the parser is the SSOT once the prompt template lands.
 */
export function parseNoOpCount(
  doneOrSession: string | SessionState | undefined | null,
): number | null {
  if (!doneOrSession) return null;
  // Object form: prefer the structured field.
  if (typeof doneOrSession === "object") {
    if (typeof doneOrSession.noOpCount === "number") return doneOrSession.noOpCount;
    return parseNoOpCountFromText(doneOrSession.done);
  }
  return parseNoOpCountFromText(doneOrSession);
}

function parseNoOpCountFromText(done: string | undefined | null): number | null {
  if (!done) return null;
  const match = done.match(/no-op\s+turn\s+#(\d+)/i);
  return match ? parseInt(match[1]!, 10) : null;
}

/**
 * True when the agent is blocked on a human action. Reads the structured
 * `blockReason` field if present; otherwise content-sniffs `status: blocked`
 * or `health: … awaiting user` for back-compat.
 *
 * Agents emitting the structured field win unconditionally — the moment all
 * SPACE templates ship the new format, the content-sniff arm goes cold.
 */
export function isAwaitingUser(session: SessionState | null | undefined): boolean {
  if (!session) return false;
  if (session.blockReason) return true;
  if (session.status?.toLowerCase().trim() === SESSION_STATUS.BLOCKED) return true;
  return /awaiting\s+user/i.test(session.health ?? "");
}

/**
 * Derived loop state — distinct from `status: ready | working` because the
 * autopilot loop is a separate axis from the agent's per-turn lifecycle.
 *
 *   firing  → agent is `ready` and the wrapper will re-invoke it on the
 *             next tick. If noOpCount >= 1 it's a spiral.
 *   active  → agent is mid-turn (status: working). Loop is implicitly alive.
 *   paused  → agent is blocked on the user; the loop should NOT fire (and
 *             the patched autopilot-needs-fire guard ensures it doesn't).
 *   unknown → no session.md ever pushed (new project, runner never seen).
 */
export type LoopState = "firing" | "active" | "paused" | "unknown";

export type DerivedLoopState = {
  state: LoopState;
  /** Pulled out of `done: No-op turn #N.` when present. */
  noOpCount: number | null;
  /** True when the agent's last write put it in a human-blocked state. */
  awaitingUser: boolean;
};

export function deriveLoopState(session: SessionState | null | undefined): DerivedLoopState {
  if (!session) {
    return { state: "unknown", noOpCount: null, awaitingUser: false };
  }
  const awaitingUser = isAwaitingUser(session);
  // Pass the whole session so the structured `noOpCount` field wins over
  // content-sniffing `done:` text. Both paths still work — only the priority
  // changes once agents start emitting the structured field.
  const noOpCount = parseNoOpCount(session);
  const status = session.status?.toLowerCase().trim();

  if (awaitingUser) return { state: "paused", noOpCount, awaitingUser };
  if (status === SESSION_STATUS.WORKING) return { state: "active", noOpCount, awaitingUser };
  if (status === SESSION_STATUS.READY) return { state: "firing", noOpCount, awaitingUser };
  // Missing/unknown status — treat as firing-ish so the UI surfaces the
  // count if a spiral is forming, but the bash guard suppresses real
  // wake-ups (its default-fire only triggers when status semantics check out).
  return { state: "firing", noOpCount, awaitingUser };
}
