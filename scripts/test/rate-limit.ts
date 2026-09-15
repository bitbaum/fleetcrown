/**
 * Inline tests for the ONE rate limiter (lib/rate-limit.ts → limitkit).
 *
 * Two things are pinned here, and the second is the reason this file exists.
 *
 * 1. `checkRateLimit` actually trips, counts per key, and separates rules. The
 *    PIN route used to hand-roll its own Map beside this; a limiter nobody
 *    tests is indistinguishable from a limiter that always returns true.
 *
 * 2. `getClientIp` reads the LAST `X-Forwarded-For` hop, not the first. Six
 *    sibling repos shipped the first-hop version, and it is not a cosmetic
 *    difference: the leftmost hop is written by the CLIENT, so a fresh random
 *    value per request is a fresh bucket per request and no bucket ever fills.
 *    A limiter that cannot be tripped is not a limiter. Keyed on the rightmost
 *    hop — the one our own proxy wrote — the attacker cannot choose his bucket.
 *
 * Run: npx tsx scripts/test/rate-limit.ts
 */
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

let passed = 0;
const check = (label: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
};

const req = (headers: Record<string, string>): NextRequest =>
  ({ headers: new Headers(headers) }) as NextRequest;

check("the limiter trips on the hit after the limit", () => {
  const key = `test:trip:${Math.random()}`;
  for (let i = 0; i < 5; i++) {
    assert(checkRateLimit(key, 5, 60_000), `hit ${i + 1} of 5 was refused`);
  }
  assert(!checkRateLimit(key, 5, 60_000), "the 6th hit inside the window was allowed");
});

check("two keys under the same rule count apart", () => {
  const a = `test:a:${Math.random()}`;
  const b = `test:b:${Math.random()}`;
  for (let i = 0; i < 5; i++) checkRateLimit(a, 5, 60_000);
  assert(!checkRateLimit(a, 5, 60_000), "key a did not fill");
  assert(checkRateLimit(b, 5, 60_000), "filling one key throttled an unrelated one");
});

check("the PIN route's rule (5 per minute, per user) is enforceable", () => {
  const userId = `pin:${Math.random()}`;
  const tries = Array.from({ length: 6 }, () => checkRateLimit(userId, 5, 60_000));
  assert(
    tries.filter(Boolean).length === 5,
    `expected 5 of 6 PIN attempts allowed, got ${tries.filter(Boolean).length}`,
  );
});

check("getClientIp takes the LAST forwarded hop, never the client-written first", () => {
  // The attacker controls everything he sends; our proxy appends the address it
  // actually saw. Anything left of that is his to invent.
  const ip = getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }));
  assert(ip === "203.0.113.9", `keyed on a client-controlled hop: ${ip}`);
});

check("a spoofed forwarded chain cannot mint a fresh bucket per request", () => {
  // The bypass, written out: same real client, a different invented first hop
  // each time. With a first-hop key every call is a new bucket and the limiter
  // never trips — so this test fails loudly if the extraction ever regresses.
  const rule = 5;
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    seen.add(getClientIp(req({ "x-forwarded-for": `9.9.9.${i}, 198.51.100.4` })));
  }
  assert(seen.size === 1, `spoofed hops produced ${seen.size} buckets, expected 1`);
  const key = `spoof:${Math.random()}:${[...seen][0]}`;
  const allowed = Array.from({ length: 6 }, () => checkRateLimit(key, rule, 60_000)).filter(
    Boolean,
  );
  assert(allowed.length === rule, `limiter allowed ${allowed.length}, expected ${rule}`);
});

check("a single-hop chain still reads as the client", () => {
  assert(
    getClientIp(req({ "x-forwarded-for": "198.51.100.7" })) === "198.51.100.7",
    "the common one-proxy shape stopped working",
  );
});

check("no forwarded header falls back to x-real-ip, then to a shared bucket", () => {
  assert(getClientIp(req({ "x-real-ip": "203.0.113.2" })) === "203.0.113.2", "x-real-ip ignored");
  assert(getClientIp(req({})) === "unknown", "a header-less request produced a fake address");
});

console.log(`\n✓ rate-limit tests passed (${passed} assertions)`);
