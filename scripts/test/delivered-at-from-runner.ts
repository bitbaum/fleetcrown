/**
 * The delivery stamp prefers the runner's injection time (close-from-session.ts
 * deliveryStampFor), within honest bounds. Fixture: the 2026-09-15 e2e run —
 * injected 05:12:55, handoff 05:13:06, ack 05:13:11 — which never closed
 * because the floor was stamped at ack time.
 * Run: npx tsx scripts/test/delivered-at-from-runner.ts
 */
import assert from "node:assert/strict";
import { deliveryStampFor } from "@/lib/orchestration/close-from-session";

let pass = 0;
function check(name: string, fn: () => void) {
  fn();
  pass++;
  console.log(`  ✓ ${name}`);
}
const started = new Date("2026-09-15T05:12:49Z");
const ack = Date.parse("2026-09-15T05:13:11Z");
const injected = "2026-09-15T05:12:55.000Z";

check("the runner's injection time becomes the floor", () => {
  assert.equal(deliveryStampFor(injected, started, ack), injected);
});
check("…so a handoff written after injection but before the ack post-dates it", () => {
  const handoff = Date.parse("2026-09-15T05:13:06Z");
  assert.ok(handoff > Date.parse(deliveryStampFor(injected, started, ack)));
});
check("no report → ack time, as before", () => {
  assert.equal(deliveryStampFor(undefined, started, ack), new Date(ack).toISOString());
  assert.equal(deliveryStampFor("garbage", started, ack), new Date(ack).toISOString());
});
check("a report from the future or from before the run is refused", () => {
  assert.equal(deliveryStampFor("2026-09-15T05:20:00Z", started, ack), new Date(ack).toISOString());
  assert.equal(deliveryStampFor("2026-09-15T05:00:00Z", started, ack), new Date(ack).toISOString());
});
check("a minute of clock slack before run creation is tolerated", () => {
  assert.equal(deliveryStampFor("2026-09-15T05:12:20Z", started, ack), "2026-09-15T05:12:20.000Z");
});
console.log(`\ndelivered-at-from-runner: ${pass} passed`);
