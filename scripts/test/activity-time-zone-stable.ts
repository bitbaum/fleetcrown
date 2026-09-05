/**
 * The activity time formatters must produce the SAME string in every process
 * timezone, because they run in two processes with different ones.
 *
 * WHY THIS EXISTS
 *
 * activity-shared.ts formats with `toLocaleTimeString(APP_LOCALE, …)` and no
 * `timeZone`, which reads the RUNTIME's zone. The components calling them are
 * "use client", so they render on the box (UTC) for the HTML and in the browser
 * (Europe/Zurich) on hydration. The server wrote "Sent 10:18" and the client
 * wrote "Sent 12:18"; React discarded the tree — #418 on /activity at every
 * viewport, production only, invisible in dev because dev server and dev
 * browser share a clock.
 *
 * Measured on one production page load 2026-09-05: 1798 words server, 1798
 * client, every clock differing by exactly two hours.
 *
 * `formatDayHeading` had the same fault in a two-hour window: it compared
 * `new Date(y, m-1, d)` against `now.getFullYear()/getMonth()/getDate()`, all
 * runtime-zone, so between 00:00 and 02:00 Zurich the box was still on
 * yesterday while the browser was on today. That is why the failure looked
 * intermittent before the whole file was pinned.
 *
 * The check runs the formatters in two child processes — TZ=UTC and
 * TZ=Europe/Zurich — and compares. Reading the source for the string
 * "timeZone" would pass on a formatter that pins the WRONG zone, and would say
 * nothing about the date arithmetic in formatDayHeading.
 *
 * Run: npx tsx scripts/test/activity-time-zone-stable.ts
 */
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Static, not a top-level `await import`: tsx transforms this to CJS, which
// cannot require an async module (ERR_REQUIRE_ASYNC_MODULE). The module is
// pure — no DB, no React — so importing it in both modes costs nothing.
import {
  formatClockTime,
  formatActivityTime,
  formatPulseBucketLabel,
  formatDayHeading,
} from "../../src/components/activity/activity-shared";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const SELF = fileURLToPath(import.meta.url);

// An instant that lands on DIFFERENT calendar days in the two zones: 22:30 UTC
// is 00:30 the NEXT day in Zurich. A fixture at noon would pass under a broken
// implementation, which is the whole failure mode being guarded.
const INSTANT = "2026-09-05T22:30:00.000Z";
const DAY_KEY = "2026-09-06";

// Child mode: print what the formatters produce in THIS process's zone.
if (process.env.__ACTIVITY_TZ_PROBE === "1") {
  console.log(
    JSON.stringify({
      clock: formatClockTime(INSTANT),
      full: formatActivityTime(INSTANT),
      bucketDay: formatPulseBucketLabel(INSTANT, "day"),
      bucketMonth: formatPulseBucketLabel(INSTANT, "month"),
      heading: formatDayHeading(DAY_KEY, new Date(INSTANT)),
    }),
  );
  process.exit(0);
}

function runIn(tz: string): Record<string, string> {
  const res = spawnSync(join(repoRoot, "node_modules/.bin/tsx"), [SELF], {
    env: { ...process.env, TZ: tz, __ACTIVITY_TZ_PROBE: "1" },
    encoding: "utf8",
    cwd: repoRoot,
  });
  if (res.status !== 0) {
    console.error(`  ✗ probe failed under TZ=${tz}: ${(res.stderr || "").slice(0, 400)}`);
    process.exit(1);
  }
  return JSON.parse(res.stdout.trim().split("\n").pop() ?? "{}");
}

const utc = runIn("UTC");
const zurich = runIn("Europe/Zurich");
const honolulu = runIn("Pacific/Honolulu"); // a zone on the other side of the date line

let pass = 0;
let fail = 0;
for (const key of Object.keys(utc)) {
  const a = utc[key];
  const b = zurich[key];
  const c = honolulu[key];
  if (a === b && b === c) {
    pass++;
    console.log(`  ✓ ${key}: "${a}" in every process timezone`);
  } else {
    fail++;
    console.error(`  ✗ ${key} depends on the process timezone:`);
    console.error(`      TZ=UTC             → "${a}"`);
    console.error(`      TZ=Europe/Zurich   → "${b}"`);
    console.error(`      TZ=Pacific/Honolulu→ "${c}"`);
    console.error(`      A "use client" component renders in BOTH the server's`);
    console.error(`      zone and the reader's, so this is a hydration mismatch.`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
