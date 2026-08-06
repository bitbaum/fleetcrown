// Pins the elapsed-label phrasing. shortTimeAgo returns the bare token "now"
// under a minute, so `${shortTimeAgo(t)} ago` printed "now ago" — during the
// first minute after a check, which is exactly when a user is looking.
// Run: npx tsx scripts/test/atlas-format.ts
import { agoLabel } from "@/lib/atlas/format";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const now = Date.now();
eq(agoLabel(now), "just now", "under a minute reads as English, never 'now ago'");
eq(agoLabel(now - 5_000), "just now", "5s");
eq(agoLabel(now - 5 * 60_000), "5m ago", "minutes");
eq(agoLabel(now - 3 * 3_600_000), "3h ago", "hours");
eq(agoLabel(now - 2 * 86_400_000), "2d ago", "days");

// A future timestamp (clock skew between box and browser) must not produce a
// negative or nonsense label.
eq(agoLabel(now + 10_000), "just now", "future timestamp clamps to just now");

console.log(`${pass}/${pass + fail} atlas-format cases passed`);
if (fail > 0) process.exit(1);
