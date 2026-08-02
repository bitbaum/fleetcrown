/**
 * Escalation ladder — retry → patch → replan → human. Pure logic (no db).
 *
 * The ladder converts consecutive failing closes into STRUCTURE instead of
 * vibes: each failing run advances the project's open escalation one rung,
 * and the rung shapes the NEXT already-scheduled autopilot dispatch (the
 * objection is fed back to the agent first — humans see only what agents
 * can't route around). The ladder never dispatches anything by itself:
 * uncapped auto-retry is how fleets burn money, so cadence stays owned by
 * the existing autopilot loop and its cooldowns.
 *
 * The top rung is the failure brake: FAILURE_BRAKE_STREAK in
 * dispatch-gates.ts imports ESCALATION_HUMAN_STREAK so "autopilot stops"
 * and "a human is alerted" are the same rung by construction and can never
 * drift apart.
 */

export const ESCALATION_LEVELS = ["retry", "patch", "replan", "human"] as const;
export type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

/** Streak at which the ladder reaches 'human' — and the failure brake trips. */
export const ESCALATION_HUMAN_STREAK = 4;

/** Map a consecutive-failure streak onto a rung. Streak ≤ 0 has no rung. */
export function levelForStreak(failStreak: number): EscalationLevel | null {
  if (failStreak <= 0) return null;
  return ESCALATION_LEVELS[Math.min(failStreak, ESCALATION_HUMAN_STREAK) - 1];
}

/**
 * The rung-specific instruction injected into the next dispatch. Deliberately
 * forceful at each step: same-approach retries are only sanctioned on rung 1.
 */
export function escalationInstruction(level: EscalationLevel): string {
  switch (level) {
    case "retry":
      return (
        "Your previous run on this project FAILED (reason below). Diagnose whether the failure " +
        "was transient (network, rate limit, flaky test). If so, retry the same objective carefully; " +
        "if not, treat this as rung 2 and fix the blocker before continuing."
      );
    case "patch":
      return (
        "The last TWO runs on this project failed. Do NOT retry the same approach. First find and " +
        "fix the underlying blocker (broken build, failing test, bad state, missing dependency), " +
        "verify the fix, and only then continue the original objective."
      );
    case "replan":
      return (
        "THREE consecutive runs failed — the current approach is not working. Step back and re-plan: " +
        "state in the session handoff why the previous attempts failed, choose a genuinely different " +
        "approach or a much smaller verifiable step, and pursue that instead. If nothing viable " +
        "remains, write status: blocked with a block-reason so a human decision is requested."
      );
    case "human":
      return (
        "Four consecutive runs failed. Autopilot is braked and the operator has been alerted — " +
        "do not attempt further automated work on this objective."
      );
  }
}

export interface EscalationView {
  level: EscalationLevel;
  failStreak: number;
  lastError?: string | null;
}

/**
 * Render the block injected into dispatch prompts. Returns null at 'human'
 * (nothing should be dispatching then — the brake owns that state).
 */
export function renderEscalationBlock(esc: EscalationView): string | null {
  if (esc.level === "human") return null;
  const rung = ESCALATION_LEVELS.indexOf(esc.level) + 1;
  const lines = [
    `## Escalation state (operator dispatch pipeline — rung ${rung}/${ESCALATION_LEVELS.length}: ${esc.level.toUpperCase()})`,
    escalationInstruction(esc.level),
  ];
  if (esc.lastError) {
    lines.push(`Last recorded failure: ${esc.lastError.slice(0, 500)}`);
  }
  return lines.join("\n");
}
