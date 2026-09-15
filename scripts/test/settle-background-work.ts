/**
 * The one-shot drain window (lib/orchestration/settle-background-work.ts).
 * Run: npx tsx scripts/test/settle-background-work.ts
 */
import assert from "node:assert/strict";
import {
  settleBackgroundWork,
  BACKGROUND_DRAIN_MS,
} from "@/lib/orchestration/settle-background-work";

let pass = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  pass++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  await check("it waits the window it was given", async () => {
    const waited: number[] = [];
    await settleBackgroundWork(1234, async (d) => {
      waited.push(d);
    });
    assert.deepEqual(waited, [1234]);
  });

  await check("a non-positive or nonsense window waits not at all", async () => {
    const waited: number[] = [];
    const spy = async (d: number) => {
      waited.push(d);
    };
    await settleBackgroundWork(0, spy);
    await settleBackgroundWork(-1, spy);
    await settleBackgroundWork(Number.NaN, spy);
    assert.deepEqual(waited, []);
  });

  await check("the default window is long enough for a database round trip", () => {
    assert.ok(BACKGROUND_DRAIN_MS >= 1_000);
    return Promise.resolve();
  });

  console.log(`\nsettle-background-work: ${pass} passed`);
}

main();
