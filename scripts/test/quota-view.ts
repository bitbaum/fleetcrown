/**
 * The quota surface, and the rule it enforces: a number without an action is
 * decoration.
 *
 * The load-bearing cases are the ones about ABSENCE. A provider nobody has
 * called has no reading, and drawing that as a full tank is the same mistake as
 * trusting a vendor's own usage endpoint — which was measured reporting an
 * untouched allowance while the key was locked out of free models.
 *
 * Run: npx tsx scripts/test/quota-view.ts
 */
import assert from "node:assert/strict";
import {
  describeQuota,
  unknownQuota,
  summarise,
  refillsIn,
  TOKENS_PER_ANSWER,
} from "@/lib/ai/quota-view";

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const row = (over: Partial<Parameters<typeof describeQuota>[0]> = {}) => ({
  provider: "groq",
  model: "openai/gpt-oss-120b",
  scope: "requests",
  window: "day",
  quotaLimit: 1000,
  remaining: 900,
  resetAt: new Date(Date.UTC(2026, 8, 13, 0, 0, 0)),
  observedAt: new Date(NOW - 30_000),
  ...over,
});

// ── Every row carries its consequence ───────────────────────────────────────
check("a healthy counter says what is left AND what happens after", () => {
  const v = describeQuota(row(), { now: NOW, nextProvider: "openrouter" });
  assert.equal(v.state, "known");
  assert.equal(v.answers, 900);
  assert.match(v.detail, /900 of 1,000 requests today/);
  assert.equal(v.refills, "in 12 hours");
  assert.match(v.consequence, /moves to openrouter/);
});

check("the last link in the chain does not imply a safety net it does not have", () => {
  const v = describeQuota(row(), { now: NOW, nextProvider: null });
  assert.match(v.consequence, /last link/);
  assert.doesNotMatch(v.consequence, /moves to/);
});

// ── Tokens become answers ───────────────────────────────────────────────────
check("a token counter is translated into answers, the unit a person thinks in", () => {
  const v = describeQuota(
    row({ scope: "tokens", window: "minute", quotaLimit: 8000, remaining: 7927 }),
    { now: NOW, nextProvider: "openrouter" },
  );
  assert.equal(v.answers, Math.floor(7927 / TOKENS_PER_ANSWER));
  assert.match(v.detail, /7,927 of 8,000 tokens this minute/, v.detail);
});

// ── The three states ────────────────────────────────────────────────────────
check("zero remaining is EXHAUSTED, and it is urgent", () => {
  const v = describeQuota(row({ remaining: 0 }), { now: NOW, nextProvider: "openrouter" });
  assert.equal(v.state, "exhausted");
  assert.equal(v.urgent, true);
  assert.equal(v.refills, "in 12 hours", "and it still says when it comes back");
});

check("a provider never called is UNKNOWN, with the reason stated", () => {
  const v = unknownQuota("cloudflare", "no answer served yet today");
  assert.equal(v.state, "unknown");
  assert.equal(v.answers, null, "null, not 0 — absence is not emptiness");
  assert.equal(v.level, null, "and there is nothing to draw a gauge against");
  assert.equal(v.urgent, false);
});

check("a stale per-MINUTE reading reverts to unknown rather than lying", () => {
  // A minute counter read six minutes ago says nothing about now. Reporting it
  // as current is how a dashboard becomes confidently wrong.
  const v = describeQuota(
    row({ scope: "tokens", window: "minute", observedAt: new Date(NOW - 6 * 60_000) }),
    { now: NOW, nextProvider: null },
  );
  assert.equal(v.state, "unknown");
  assert.equal(v.answers, null);
  assert.match(v.detail, /not measured recently/);
});

check("a DAY reading from hours ago is still good — it does not refill until reset", () => {
  const v = describeQuota(row({ observedAt: new Date(NOW - 6 * 60 * 60_000) }), {
    now: NOW,
    nextProvider: null,
  });
  assert.equal(v.state, "known", "staleness is per-window, not a single timeout");
});

// ── Attention budget ────────────────────────────────────────────────────────
check("a nearly-full counter is not urgent; a nearly-empty one is", () => {
  assert.equal(
    describeQuota(row({ remaining: 900 }), { now: NOW, nextProvider: null }).urgent,
    false,
  );
  assert.equal(
    describeQuota(row({ remaining: 50 }), { now: NOW, nextProvider: null }).urgent,
    true,
  );
});

check("no stated ceiling means no gauge, rather than a made-up one", () => {
  const v = describeQuota(row({ quotaLimit: null, remaining: 42 }), {
    now: NOW,
    nextProvider: null,
  });
  assert.equal(v.level, null);
  assert.match(v.detail, /42 requests left today/);
});

// ── Refill wording ──────────────────────────────────────────────────────────
check("refill times read as a person would say them", () => {
  assert.equal(refillsIn(new Date(NOW + 40_000), NOW), "in under a minute");
  assert.equal(refillsIn(new Date(NOW + 12 * 60_000), NOW), "in 12 minutes");
  assert.equal(refillsIn(new Date(NOW + 3 * 3600_000), NOW), "in 3 hours");
  assert.equal(refillsIn(new Date(NOW - 5_000), NOW), "now");
  assert.equal(refillsIn(null, NOW), null, "a vendor that did not say gets no invented time");
});

// ── The headline ────────────────────────────────────────────────────────────
check("the summary leads with the total when things are healthy", () => {
  const rows = [
    describeQuota(row(), { now: NOW, nextProvider: "openrouter" }),
    describeQuota(row({ provider: "openrouter", remaining: 40, quotaLimit: 50 }), {
      now: NOW,
      nextProvider: null,
    }),
  ];
  assert.match(summarise(rows), /About 940 more answers available/);
});

check("all-unknown says so, instead of implying health nobody checked", () => {
  const s = summarise([unknownQuota("groq", "x"), unknownQuota("openrouter", "y")]);
  assert.match(s, /Nothing measured yet across 2 providers/);
});

check("everything spent is the headline, with the time it returns", () => {
  const s = summarise([describeQuota(row({ remaining: 0 }), { now: NOW, nextProvider: null })]);
  assert.match(s, /Every measured provider is spent/);
  assert.match(s, /in 12 hours/);
});

check("a partial outage names both halves rather than averaging them away", () => {
  const s = summarise([
    describeQuota(row(), { now: NOW, nextProvider: null }),
    describeQuota(row({ provider: "openrouter", remaining: 0 }), { now: NOW, nextProvider: null }),
    unknownQuota("cloudflare", "not called yet"),
  ]);
  assert.match(s, /900 more answers/);
  assert.match(s, /1 provider is spent/);
  assert.match(s, /1 not measured yet/);
});

check("no providers at all is stated plainly, not as zero remaining", () => {
  assert.match(summarise([]), /No AI providers are configured/);
});

console.log(`✓ quota view: ${passed} checks passed`);
