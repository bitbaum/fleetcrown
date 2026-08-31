/**
 * Inline tests for fair-share rationing (lib/ai-budget/fair-share.ts).
 *
 * The property under test is not "the arithmetic is right" — it is "a user who
 * shows up later can still use the product". A free tier of ~100k tokens/day at
 * ~10k per turn is about ten turns for everyone combined; divided badly, the
 * first enthusiastic user spends the day before lunch and the newcomer meets a
 * wall and concludes the thing is broken.
 *
 * Numbers below are chosen to be checkable by hand: a 100_000-token day and a
 * 10_000-token turn, so a share is a round number and "how many turns" is
 * obvious.
 *
 * Run: npm run test:fair-share
 */
import {
  fairShare,
  utcDayElapsed,
  utcDayKey,
  DAY_SECONDS,
  DEFAULT_BURST,
} from "@/lib/ai-budget/fair-share";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const DAY = 100_000;
const TURN = 10_000;
const ask = (over: Partial<Parameters<typeof fairShare>[0]> = {}) =>
  fairShare({
    dayCapacityTokens: DAY,
    activeUsers: 1,
    userSpentTokens: 0,
    costTokens: TURN,
    dayElapsed: 0.5,
    ...over,
  });

// ── the split itself ─────────────────────────────────────────────────────────
check("a lone user on a quiet day gets the WHOLE budget, not a rationed slice", () => {
  // Rationing against registered-but-dormant accounts would waste the budget it
  // was meant to spend generously.
  const d = ask({ activeUsers: 1 });
  assert(d.shareTokens === DAY, `share was ${d.shareTokens}, expected ${DAY}`);
});

check("the share recomputes as users arrive", () => {
  assert(ask({ activeUsers: 2 }).shareTokens === 50_000, "2 users → 50k each");
  assert(ask({ activeUsers: 4 }).shareTokens === 25_000, "4 users → 25k each");
});

check("shares never over-commit the day", () => {
  for (const users of [1, 3, 7, 50]) {
    const total = ask({ activeUsers: users }).shareTokens * users;
    assert(total <= DAY + 1e-6, `${users} users × share = ${total} > ${DAY}`);
  }
});

// ── the requirement: a newcomer can always get in ────────────────────────────
check("a newcomer's FIRST turn is never refused while their share covers it", () => {
  // The failure this whole file exists to prevent: four active users, a fresh
  // arrival at one minute past midnight. Pure pacing would allow 25000*0.25 =
  // 6250 tokens and refuse a 10k turn — "come back in three hours" reads as
  // broken to someone trying the product for the first time.
  const d = ask({ activeUsers: 4, dayElapsed: 0, userSpentTokens: 0 });
  assert(d.allowed, `newcomer refused at day start: ${d.reason}`);
});

check("that floor never exceeds the user's actual share", () => {
  // 20 users on a 100k day → 5k each, less than one 10k turn. The floor must
  // not invent capacity that isn't theirs.
  const d = ask({ activeUsers: 20, dayElapsed: 0 });
  assert(d.allowanceTokens <= d.shareTokens + 1e-9, "floor handed out more than the share");
  assert(!d.allowed && d.reason === "share-spent", `expected share-spent, got ${d.reason}`);
});

check("a heavy early user cannot drain the day before anyone else wakes up", () => {
  // Two users, 50k each. At 08:00 (elapsed 1/3) the first user has already spent
  // 30k. Their share would permit 50k; pacing must not.
  const d = ask({ activeUsers: 2, userSpentTokens: 30_000, dayElapsed: 1 / 3 });
  assert(!d.allowed && d.reason === "paced", `expected paced, got ${d.reason}`);
  assert(d.allowanceTokens < d.shareTokens, "pacing did not restrain the allowance");
});

// ── the two refusals mean different things ───────────────────────────────────
check("'paced' carries a retry; 'share-spent' does NOT", () => {
  const paced = ask({ activeUsers: 2, userSpentTokens: 30_000, dayElapsed: 1 / 3 });
  assert(
    paced.reason === "paced" && typeof paced.retryAfterSeconds === "number",
    "paced needs a retry",
  );

  const spent = ask({ activeUsers: 2, userSpentTokens: 45_000, dayElapsed: 0.99 });
  assert(spent.reason === "share-spent", `expected share-spent, got ${spent.reason}`);
  // Telling someone whose share is gone to "try again in 20 minutes" is the same
  // lie as telling a spent daily quota to "try again shortly".
  assert(spent.retryAfterSeconds === undefined, "share-spent must not promise a retry");
});

check("the retry advice is CORRECT — replaying at that moment succeeds", () => {
  const at = 1 / 3;
  const d = ask({ activeUsers: 2, userSpentTokens: 30_000, dayElapsed: at });
  assert(d.reason === "paced" && d.retryAfterSeconds !== undefined, "expected a paced refusal");
  const later = at + d.retryAfterSeconds! / DAY_SECONDS;
  const again = ask({ activeUsers: 2, userSpentTokens: 30_000, dayElapsed: later });
  assert(again.allowed, `retry advice was wrong: still ${again.reason} at elapsed ${later}`);
  // And it must not be needlessly pessimistic — a moment earlier should fail.
  const earlier = ask({ activeUsers: 2, userSpentTokens: 30_000, dayElapsed: later - 0.02 });
  assert(!earlier.allowed, "retry advice overshot — it could have been granted sooner");
});

// ── pacing behaviour over the day ────────────────────────────────────────────
check("the allowance grows through the day and reaches the full share", () => {
  const early = ask({ activeUsers: 2, dayElapsed: 0.1 }).allowanceTokens;
  const mid = ask({ activeUsers: 2, dayElapsed: 0.5 }).allowanceTokens;
  const end = ask({ activeUsers: 2, dayElapsed: 1 }).allowanceTokens;
  assert(early < mid && mid < end, `not monotonic: ${early} ${mid} ${end}`);
  assert(Math.abs(end - 50_000) < 1e-6, `end-of-day allowance was ${end}, expected the full share`);
});

check("burst is what makes minute one usable", () => {
  assert(DEFAULT_BURST > 0, "a zero burst makes 00:00 a wall");
  const d = ask({ activeUsers: 2, dayElapsed: 0, costTokens: 1 });
  assert(d.allowanceTokens > 0, "no allowance at all at day start");
});

// ── no clawback ──────────────────────────────────────────────────────────────
check("a user over their NEW smaller share is refused, never negative or thrown", () => {
  // Spent 80k while alone; three more users then arrive and the share drops to
  // 25k. Their spend cannot be taken back — the tokens are gone — so the only
  // correct behaviour is to stop granting more.
  const d = ask({ activeUsers: 4, userSpentTokens: 80_000, dayElapsed: 0.9 });
  assert(!d.allowed && d.reason === "share-spent", `expected share-spent, got ${d.reason}`);
  assert(d.allowanceTokens >= 0, "negative allowance");
});

// ── degenerate inputs must not become outages ────────────────────────────────
check("no capacity is reported as such, not as a share of zero", () => {
  const d = ask({ dayCapacityTokens: 0 });
  assert(!d.allowed && d.reason === "no-capacity", `got ${d.reason}`);
});

check("a bad user count never divides by zero", () => {
  for (const activeUsers of [0, -3, Number.NaN]) {
    const d = ask({ activeUsers });
    assert(
      Number.isFinite(d.shareTokens) && d.shareTokens > 0,
      `activeUsers=${activeUsers} → ${d.shareTokens}`,
    );
  }
});

check("a skewed clock cannot produce a negative or oversized allowance", () => {
  for (const dayElapsed of [-5, 42, Number.NaN]) {
    const d = ask({ activeUsers: 2, dayElapsed });
    assert(
      d.allowanceTokens >= 0 && d.allowanceTokens <= d.shareTokens + 1e-9,
      `elapsed=${dayElapsed}`,
    );
  }
});

// ── the day boundary ─────────────────────────────────────────────────────────
check("the day is measured in UTC, where the providers meter it", () => {
  assert(utcDayElapsed(new Date("2026-08-15T00:00:00Z")) === 0, "midnight UTC is 0");
  assert(Math.abs(utcDayElapsed(new Date("2026-08-15T12:00:00Z")) - 0.5) < 1e-9, "noon UTC is 0.5");
  assert(utcDayElapsed(new Date("2026-08-15T23:59:59Z")) > 0.999, "end of day");
});

check("the accounting bucket is the UTC date", () => {
  assert(utcDayKey(new Date("2026-08-15T23:59:59Z")) === "2026-08-15", "wrong key");
  assert(utcDayKey(new Date("2026-08-16T00:00:01Z")) === "2026-08-16", "did not roll over");
});

console.log(`\n${passed} passed`);
