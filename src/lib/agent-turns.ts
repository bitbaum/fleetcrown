import type { LiveAgentTurns } from "@/lib/control-types";

/**
 * How long an unterminated agent turn stays believable.
 *
 * A session killed mid-turn (SIGKILL, crash, closed laptop) never sends its
 * Stop hook, so `ended_at IS NULL` alone would pin a project to "working"
 * forever — the same stale-sentinel failure the /tmp current-prompt path
 * already had, where a dead Codex tab showed "working 61h". 30 minutes matches
 * STALE_PROMPT_S in control-presenter.ts on purpose: two independent
 * definitions of "too old to believe" would eventually disagree on screen, and
 * the user would be right to trust neither.
 */
export const OPEN_TURN_TTL_MS = 30 * 60 * 1000;

/** The row shape bucketTurnsByProject needs — deliberately narrower than the
 *  Drizzle row so this module stays free of any database import. That matters:
 *  the pure unit suite runs with no DATABASE_URL, and importing db/queries here
 *  would drag in the connection and fail every test at import time. */
export type OpenTurn = {
  projectKey: string;
  cwd: string;
  startedAt: Date;
};

/**
 * Group open turns by project for the Control payload.
 *
 * Pure on purpose: this is the arithmetic behind "N working", so it is worth
 * being able to test without a database.
 */
export function bucketTurnsByProject(rows: OpenTurn[]): Record<string, LiveAgentTurns> {
  const out: Record<string, LiveAgentTurns> = {};
  for (const row of rows) {
    const startedAt = row.startedAt.toISOString();
    const bucket = out[row.projectKey];
    if (!bucket) {
      out[row.projectKey] = { count: 1, startedAt, cwds: [row.cwd] };
      continue;
    }
    bucket.count += 1;
    // Report the OLDEST open turn: "working 40m" should describe the run that
    // has been going longest, not whichever session most recently pinged.
    if (startedAt < bucket.startedAt) bucket.startedAt = startedAt;
    if (!bucket.cwds.includes(row.cwd)) bucket.cwds.push(row.cwd);
  }
  return out;
}
