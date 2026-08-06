// Pins isEventSlotPassed — the rule that RETIRES rows from the approval queue.
//
// Why it earns a test: it is the only expiry rule that reads the JSONB payload
// rather than a column, it mutates data with no human in the loop, and when it
// first ran in prod (2026-08-06) it matched nothing — the 30-day age cap had
// already swept every candidate — so production exercised the branch zero
// times. An untested rule that deletes decisions is a rule you are trusting,
// not one you know.
//
// The dangerous direction is a FALSE POSITIVE: expiring something still live
// silently drops a request the operator made. So the "we don't know" cases are
// asserted as loudly as the positive ones.
import { isEventSlotPassed } from "@/lib/actions/calendar-event";

const NOW = Date.parse("2026-08-06T10:00:00Z");

let pass = 0;
const cases: Array<[string, boolean]> = [];
const check = (name: string, cond: boolean) => {
  cases.push([name, cond]);
  if (cond) pass++;
};

// ── Timed events ────────────────────────────────────────────────────────────
check(
  "timed event that ended an hour ago ⇒ passed",
  isEventSlotPassed({ eventStart: "2026-08-06T08:00:00Z", eventEnd: "2026-08-06T09:00:00Z" }, NOW) === true,
);
check(
  "timed event still running right now ⇒ NOT passed",
  isEventSlotPassed({ eventStart: "2026-08-06T09:30:00Z", eventEnd: "2026-08-06T11:00:00Z" }, NOW) === false,
);
check(
  "timed event later today ⇒ NOT passed",
  isEventSlotPassed({ eventStart: "2026-08-06T15:00:00Z" }, NOW) === false,
);
check(
  "start-only event that began 3h ago ⇒ passed (implicit +1h end)",
  isEventSlotPassed({ eventStart: "2026-08-06T07:00:00Z" }, NOW) === true,
);
check(
  "timezone offsets are respected, not stripped",
  isEventSlotPassed({ eventStart: "2026-08-06T13:00:00+02:00" }, NOW) === false, // 11:00Z, still ahead
);

// ── All-day events: the end date is EXCLUSIVE ───────────────────────────────
check(
  "all-day event TODAY ⇒ NOT passed (exclusive end is tomorrow)",
  isEventSlotPassed({ eventDate: "2026-08-06" }, NOW) === false,
);
check(
  "all-day event yesterday ⇒ passed",
  isEventSlotPassed({ eventDate: "2026-08-05" }, NOW) === true,
);
check(
  "all-day event next week ⇒ NOT passed",
  isEventSlotPassed({ eventDate: "2026-08-13" }, NOW) === false,
);

// ── Unknown must never read as expired ──────────────────────────────────────
// The real payload that started all this: Loki proposes calendar events with a
// MESSAGE shape (subject/body free text) and no structured time at all. The
// enrichment pass that recovers those needs an LLM call, which a reaper must
// not make — so the honest answer here is "I don't know", and the row survives
// to age out on the ordinary time limit instead of being silently dropped.
check(
  "message-shaped payload (no structured time) ⇒ NOT passed",
  isEventSlotPassed({
    to: "primary",
    channel: "calendar",
    subject: "Appointment with Simon",
    body: "Create primary calendar event: 'Appointment with Simon' from 2026-01-01T15:00:00+02:00 to 2026-01-01T16:00:00+02:00",
  }, NOW) === false,
);
check("empty payload ⇒ NOT passed", isEventSlotPassed({}, NOW) === false);
check("null payload ⇒ NOT passed", isEventSlotPassed(null, NOW) === false);
check("undefined payload ⇒ NOT passed", isEventSlotPassed(undefined, NOW) === false);
check(
  "unparseable date ⇒ NOT passed (garbage is not a verdict)",
  isEventSlotPassed({ eventStart: "next tuesday-ish" }, NOW) === false,
);
check(
  "title but no time ⇒ NOT passed",
  isEventSlotPassed({ eventTitle: "Lagertag" }, NOW) === false,
);

for (const [name, ok] of cases) console.log(`${ok ? "✓" : "✗"} ${name}`);
const total = cases.length;
if (pass !== total) {
  console.error(`\n${pass}/${total} passed`);
  process.exit(1);
}
console.log(`\n${pass}/${total} passed`);
