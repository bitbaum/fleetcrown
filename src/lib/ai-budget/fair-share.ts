/**
 * Fair-share rationing of a FIXED daily AI budget across users.
 *
 * Pure by design — no DB, no clock, no provider. Everything it needs arrives as
 * arguments, so the same policy can be lifted into any project in the fleet
 * without carrying FleetCrown's storage or model plumbing with it. The caller
 * owns "what has this user spent today"; this file owns "may they spend more".
 *
 * ── The problem it exists to solve ───────────────────────────────────────────
 * The free tiers this fleet runs on are metered per DAY and shared by everyone:
 * one vendor grants ~100k tokens/day across the whole org, and one chat turn
 * costs roughly 10k. That is about ten turns a day. Divided badly, the first
 * enthusiastic user spends the entire day's budget before lunch and everyone
 * who arrives after them meets a wall — including the person trying the product
 * for the first time, who concludes it is broken and never returns.
 *
 * So the goal is not "maximise throughput", it is "every ACTIVE user gets a
 * usable amount, every day". Those are different objectives and they favour
 * different designs.
 *
 * ── Two ideas, and both are load-bearing ─────────────────────────────────────
 *
 * 1. SHARE — capacity / active users. Recomputed per request, so the split
 *    tracks reality instead of a number set once in a config file. Crucially
 *    "active" means users who actually drew today, not everyone registered:
 *    counting dormant accounts would ration a quiet day down to nothing and
 *    waste the budget that was meant to be generous. One user on a quiet day
 *    correctly gets the whole thing.
 *
 * 2. PACING — a share alone is not enough, because a share is a whole-DAY
 *    allowance and the day is consumed in order. Without pacing, three users
 *    can each legitimately spend their full share by 09:00 and the fourth to
 *    arrive finds the capacity gone even though nobody exceeded their split.
 *    So the allowance unlocks gradually: by mid-afternoon you may have spent
 *    about half your share, by end of day all of it. That is what actually
 *    keeps capacity available for whoever shows up later.
 *
 * `burst` exists so this does not become its own wall: with pure pacing, a user
 * at one minute past midnight would have an allowance of nearly zero. A burst
 * makes the first turns immediate, which is the difference between "paced" and
 * "unusable".
 *
 * ── What it deliberately does NOT do ─────────────────────────────────────────
 * No clawback. A user who spent under an older, larger share when they were the
 * only one active is not punished when a second user appears — their allowance
 * simply stops growing until the day catches up. Taking budget back from
 * someone who already used it is impossible anyway (the tokens are spent) and
 * pretending otherwise would only produce confusing refusals.
 */

/** Seconds in a budget day. Provider quotas reset daily, so the day is the unit. */
export const DAY_SECONDS = 86_400;

/**
 * Fraction of a user's share spendable immediately, before pacing has unlocked
 * anything. Set so the first couple of turns never wait: the failure mode this
 * guards against ("I typed one question at 9am and it refused me") is far worse
 * than the one it risks (a slightly front-loaded day).
 */
export const DEFAULT_BURST = 0.25;

export type ShareInput = {
  /** Total tokens the free tiers grant for the whole day, summed across providers. */
  dayCapacityTokens: number;
  /**
   * Distinct users drawing on the budget today, INCLUDING the one asking now.
   * The caller must include the requester even on their first turn — otherwise
   * a newcomer is rationed against a divisor that does not count them, and the
   * day is briefly over-committed.
   */
  activeUsers: number;
  /** What this user has already spent today. */
  userSpentTokens: number;
  /** Estimated cost of the turn being requested. */
  costTokens: number;
  /** How far through the budget day we are, 0..1. */
  dayElapsed: number;
  /** Fraction of a share usable immediately. Defaults to DEFAULT_BURST. */
  burst?: number;
};

export type ShareReason =
  /** Within the paced allowance. */
  | "ok"
  /** Within the day's share, but not yet unlocked — waiting helps. */
  | "paced"
  /** This user's whole share for today is committed — waiting does NOT help. */
  | "share-spent"
  /** There is no budget to divide at all. */
  | "no-capacity";

export type ShareDecision = {
  allowed: boolean;
  /** Their whole-day share, before pacing. */
  shareTokens: number;
  /** What they may have spent BY NOW. */
  allowanceTokens: number;
  reason: ShareReason;
  /**
   * When it is worth asking again. Present ONLY for "paced", because that is
   * the only refusal a wait actually fixes — telling someone whose share is
   * spent to "try again in 20 minutes" is the same lie as telling a user whose
   * daily quota is gone to "try again shortly".
   */
  retryAfterSeconds?: number;
};

/** Clamp to [0, 1]; a caller's clock skew must not produce a negative allowance. */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * May this user spend `costTokens` right now?
 *
 * Recomputed per request rather than cached: `activeUsers` is the input most
 * likely to change between two turns, and a stale divisor is exactly how a new
 * user gets locked out of a budget that was supposed to include them.
 */
export function fairShare(input: ShareInput): ShareDecision {
  const capacity = Math.max(0, input.dayCapacityTokens);
  // A user is always at least one user. Guarding here rather than trusting the
  // caller keeps a bad count from becoming a division by zero at the worst
  // possible moment.
  const users = Math.max(1, Math.floor(input.activeUsers) || 1);
  const spent = Math.max(0, input.userSpentTokens);
  const cost = Math.max(0, input.costTokens);
  const burst = clamp01(input.burst ?? DEFAULT_BURST);
  const elapsed = clamp01(input.dayElapsed);

  const shareTokens = capacity / users;
  const pace = clamp01(elapsed + burst);
  // A share that cannot buy a SINGLE turn is a wall wearing a ration's clothes.
  // With four active users on a 100k day and a ~10k turn, pure pacing refuses
  // the first question of the morning and tells the user to come back in three
  // hours — which, for someone trying the product for the first time, is
  // indistinguishable from broken. So the allowance never sits below the cost
  // of one turn, capped by the share: everyone gets at least one, then pacing
  // governs the rest. Capped by `shareTokens` so this floor can never hand out
  // more than the user's actual split.
  const oneTurn = Math.min(shareTokens, cost);
  const allowanceTokens = Math.min(shareTokens, Math.max(shareTokens * pace, oneTurn));

  if (capacity <= 0) {
    return { allowed: false, shareTokens: 0, allowanceTokens: 0, reason: "no-capacity" };
  }

  const wanted = spent + cost;
  if (wanted <= allowanceTokens) {
    return { allowed: true, shareTokens, allowanceTokens, reason: "ok" };
  }

  // Past the whole-day share: no amount of waiting unlocks more today.
  if (wanted > shareTokens) {
    return { allowed: false, shareTokens, allowanceTokens, reason: "share-spent" };
  }

  // Within the share but ahead of the pace — the one case a wait fixes. Solve
  // for the elapsed fraction at which the allowance covers `wanted`.
  const neededPace = wanted / shareTokens;
  const neededElapsed = neededPace - burst;
  const retryAfterSeconds = Math.max(1, Math.ceil((neededElapsed - elapsed) * DAY_SECONDS));
  return { allowed: false, shareTokens, allowanceTokens, reason: "paced", retryAfterSeconds };
}

/**
 * How far through the UTC day `now` is, 0..1.
 *
 * UTC because that is what the providers meter on; deriving it from the
 * operator's local midnight would drift the reset away from the vendor's and
 * hand out budget that is not there.
 */
export function utcDayElapsed(now: Date): number {
  const ms = now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return clamp01(ms / (DAY_SECONDS * 1000));
}

/** The UTC day key (YYYY-MM-DD) a spend belongs to — the accounting bucket. */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}
