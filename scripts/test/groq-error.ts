/**
 * Inline tests for Groq 429 classification (lib/agent/groq-error.ts).
 *
 * The three kinds of 429 need OPPOSITE responses, and getting it wrong is not a
 * near-miss: treating a size error as capacity made the handler step down to the
 * model with HALF the token ceiling and wait 25s for a window that could never
 * be big enough — so Loki's tool loop died on every question and every answer
 * came from the toolless fallback. Treating a DAILY cap as capacity is the same
 * mistake one level deeper: the step-down model shares the exhausted daily
 * budget, so the operator pays two dead round trips and ~25s per turn for the
 * rest of the day to reach the identical failure.
 *
 * The strings below are REAL bodies captured from the live API on 2026-08-14,
 * not paraphrases — this classifier is only as good as its fidelity to them.
 *
 * Run: npm run test:groq-error
 */
import {
  classifyGroqLimit,
  groqRetryAfterSeconds,
  humanizeWait,
  rateLimitMessage,
  type GroqLimitKind,
} from "@/lib/agent/groq-error";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const is = (kind: GroqLimitKind, body: string, why: string) => {
  const got = classifyGroqLimit(body);
  assert(got === kind, `expected ${kind}, got ${got} — ${why}\n  body: ${body.slice(0, 120)}`);
  passed += 1;
};
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

// Captured verbatim: one request larger than the whole per-minute allowance.
is(
  "size",
  '{"error":{"message":"Request too large for model `llama-3.1-8b-instant` in organization `org_01jy16rk1yffks8jdsmfn4s7rj` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Requested 15041, please reduce your message size and try again. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing","type":"tokens","code":"rate_limit_exceeded"}}',
  "the real oversized-prompt body — waiting and stepping down both make it worse",
);

// Captured verbatim: the window is momentarily spent. Waiting DOES help here.
is(
  "capacity",
  '{"error":{"message":"Rate limit reached for model `llama-3.1-8b-instant` in organization `org_01jy16rk1yffks8jdsmfn4s7rj` service tier `on_demand` on tokens per minute (TPM): Limit 6000, Used 5959, Requested 400. Please try again in 3.6s","type":"tokens","code":"rate_limit_exceeded"}}',
  "the real capacity body — step down and retry",
);

// Both bodies share status, type, code AND the phrase "tokens per minute (TPM)".
// Only the opening verb differs, which is exactly why this is keyed on the body
// text and not on any structured field.
is("size", "Request too large for model X", "minimal size phrasing");
is("capacity", "Rate limit reached for model X", "minimal capacity phrasing");

// The daily cap. Captured shape from the groq-daily-token-cap note. It opens
// with the SAME "Rate limit reached" wording as capacity, so the daily check has
// to run first or the cheaper pattern silently absorbs it — which is exactly the
// bug this case pins.
is(
  "daily",
  "Rate limit reached ... on tokens per day (TPD): Limit 100000, Used 99331, Requested 4589. Please try again in 56m26.88s",
  "a spent DAY must not be treated as a spent minute — stepping down and waiting 25s both fail",
);

// Requests-per-day is the same situation: nothing helps before the reset.
is(
  "daily",
  "Rate limit reached ... on requests per day (RPD): Limit 14400",
  "RPD is a daily cap too",
);

// Context-window overflow is a size problem by another name.
is("size", "please reduce the length of the messages", "context overflow wording");

// Unrecognisable bodies must default to capacity: that path retries and
// degrades, where guessing "size" would shed context that was never the problem
// and guessing "daily" would abandon a turn that might have succeeded.
is("capacity", "", "empty body defaults to the safe path");
is("capacity", "upstream connect error", "unrelated body defaults to the safe path");

// ── the wait Groq named ──────────────────────────────────────────────────────
// Passing on the real figure is the whole difference between a message the
// operator can act on and one that invites a retry guaranteed to fail.
check("parses a seconds-only wait", () => {
  assert(groqRetryAfterSeconds("Please try again in 3.6s") === 4, "expected 4s (rounded up)");
});

check("parses a minutes+seconds wait", () => {
  const got = groqRetryAfterSeconds("Please try again in 56m26.88s");
  assert(got === 3387, `expected 3387s, got ${got}`);
});

check("a body naming no wait yields null, not a fabricated one", () => {
  assert(groqRetryAfterSeconds("Rate limit reached") === null, "invented a wait");
  assert(groqRetryAfterSeconds("") === null, "invented a wait from an empty body");
});

check("waits are phrased for a person", () => {
  assert(humanizeWait(4) === "4s", `got ${humanizeWait(4)}`);
  assert(humanizeWait(3387) === "57 minutes", `got ${humanizeWait(3387)}`);
  assert(humanizeWait(7200) === "about 2 hours", `got ${humanizeWait(7200)}`);
  assert(humanizeWait(null) === null, "null wait must stay null");
  assert(humanizeWait(0) === null, "a zero wait is no wait");
});

// ── what the operator is actually told ───────────────────────────────────────
check("an exhausted day names the reset instead of saying 'try again shortly'", () => {
  const msg = rateLimitMessage(
    "groq 429: Rate limit reached ... on tokens per day (TPD): Limit 100000, Used 99331, Requested 4589. Please try again in 56m26.88s",
  );
  assert(/daily/.test(msg), `message does not mention the daily quota: ${msg}`);
  assert(/57 minutes/.test(msg), `message does not name the real wait: ${msg}`);
  assert(!/shortly/.test(msg), `still invites an immediate retry: ${msg}`);
});

check("a spent minute still invites a retry, with the real delay", () => {
  const msg = rateLimitMessage("groq 429: Rate limit reached ... (TPM). Please try again in 3.6s");
  assert(/rate-limited/.test(msg) && /4s/.test(msg), `unhelpful capacity message: ${msg}`);
});

check("an oversized request does not tell the operator to wait — waiting cannot fix it", () => {
  const msg = rateLimitMessage("groq 429: Request too large ... please reduce your message size");
  assert(
    !/try again|resets in/.test(msg),
    `told the operator to retry a request that cannot fit: ${msg}`,
  );
});

check("the message is a clause the caller can embed, not a sentence", () => {
  // Callers wrap it as "Loki is offline — ${msg}." A capitalised, Loki-naming
  // sentence would render "Loki is offline — Loki is rate-limited — ...".
  for (const body of ["tokens per day (TPD)", "Rate limit reached", "Request too large"]) {
    const msg = rateLimitMessage(body);
    assert(msg[0] === msg[0]!.toLowerCase(), `message is capitalised: ${msg}`);
    assert(!/Loki/i.test(msg), `message names Loki, which the caller already did: ${msg}`);
    assert(!msg.endsWith("."), `message ends with a period the caller also adds: ${msg}`);
  }
});

console.log(`\n✓ groq-error tests passed (${passed} assertions)`);
