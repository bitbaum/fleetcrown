/**
 * Inline tests for Groq 429 classification (lib/agent/groq-error.ts).
 *
 * The two kinds of 429 need OPPOSITE responses, and getting it wrong is not a
 * near-miss: treating a size error as capacity made the handler step down to the
 * model with HALF the token ceiling and wait 25s for a window that could never
 * be big enough — so Loki's tool loop died on every question and every answer
 * came from the toolless fallback.
 *
 * The strings below are REAL bodies captured from the live API on 2026-08-14,
 * not paraphrases — this classifier is only as good as its fidelity to them.
 *
 * Run: npm run test:groq-error
 */
import { classifyGroqLimit } from "@/lib/agent/groq-error";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const is = (kind: "size" | "capacity", body: string, why: string) => {
  const got = classifyGroqLimit(body);
  assert(got === kind, `expected ${kind}, got ${got} — ${why}\n  body: ${body.slice(0, 120)}`);
  passed += 1;
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

// The daily cap is a capacity problem: the budget refills, so retry/degrade is
// right and shedding facts would not help. See the groq-daily-token-cap note.
is(
  "capacity",
  "Rate limit reached ... on tokens per day (TPD): Limit 100000, Used 99331, Requested 4589. Please try again in 56m26.88s",
  "daily cap is capacity, not size",
);

// Context-window overflow is a size problem by another name.
is("size", "please reduce the length of the messages", "context overflow wording");

// Unrecognisable bodies must default to capacity: that path retries and
// degrades, where guessing "size" would shed context that was never the problem.
is("capacity", "", "empty body defaults to the safe path");
is("capacity", "upstream connect error", "unrelated body defaults to the safe path");

console.log(`✓ groq-error tests passed (${passed} assertions)`);
