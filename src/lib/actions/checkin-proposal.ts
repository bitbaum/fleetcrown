/**
 * Proactive action-queue PRODUCER — propose "check in" reminders for contacts
 * whose relationship has gone cold.
 *
 * extract-proposal.ts is the *reactive* producer: it turns a chat message into a
 * draft. This is the *proactive* half — nothing was said, but the life-OS noticed
 * a fading relationship and proposes a nudge. It closes the loop the
 * `ActionQueueCard` "Check in with N people" grouping was built for but nothing
 * ever fed (the dead branch the 2026-07-13 audit flagged).
 *
 * Pure + clock-free (takes `nowMs`) so candidate selection and draft shaping are
 * unit-testable without a DB or a real clock — the I/O half lives in
 * checkin-producer.ts. We propose a CREATE_COMMITMENT ("Reach out to X") rather
 * than a send_message: most contacts have no messaging handle, whereas a
 * commitment is always executable, internal, and reversible. The operator still
 * approves every one before it does anything (IRON RULE).
 */
import { ACTION_TYPE } from "@/lib/constants/statuses";
import { toLocalDateStr } from "@/lib/dates";
import { DAY_MS } from "@/lib/constants/time";
import type { ProposeActionInput } from "@/db/queries/actions";

/** Shared with the query layer (queue-pressure/cooldown filters) and the UI
 *  (ActionQueueCard grouping) so the "Check in with " intent has ONE spelling. */
export const CHECKIN_TITLE_PREFIX = "Check in with ";

/** Give the operator a few days to actually reach out before the reminder is due. */
const REACH_OUT_DUE_DAYS = 3;

/** The subset of a contact this producer needs — kept minimal so it's trivial to
 *  build from `searchPeople` rows (and from test fixtures). */
export type CheckinCandidate = {
  id: string; // person entity id — links the action back to the contact
  name: string;
  lastInteraction: Date | null;
};

/** Whole days since the last logged interaction, or null if never interacted. */
export function daysSinceInteraction(lastInteraction: Date | null, nowMs: number): number | null {
  if (!lastInteraction) return null;
  return Math.floor((nowMs - lastInteraction.getTime()) / DAY_MS);
}

/** Shape one contact into a draft-action proposal. Pure — no DB, no clock. */
export function buildCheckinProposal(contact: CheckinCandidate, nowMs: number): ProposeActionInput {
  const days = daysSinceInteraction(contact.lastInteraction, nowMs);
  const sincePhrase = days === null ? "a long time" : `${days} days`;
  const dueDate = toLocalDateStr(new Date(nowMs + REACH_OUT_DUE_DAYS * DAY_MS));
  return {
    type: ACTION_TYPE.CREATE_COMMITMENT,
    title: `${CHECKIN_TITLE_PREFIX}${contact.name}`,
    description: `Reach out to ${contact.name} — no interaction in ${sincePhrase}.`,
    payload: { commitment: `Reach out to ${contact.name}`, dueDate },
    reasoning: `No interaction in ${sincePhrase} — keep the relationship warm.`,
    entityId: contact.id,
  };
}

/**
 * Pick which cold contacts to propose this tick. Pure so the throttle logic is
 * testable. `contacts` is assumed pre-sorted oldest-contacted-first (the caller
 * sorts by health/last_interaction). Drops nameless rows and any contact still
 * inside its cooldown, then caps to `maxPerTick`.
 */
export function selectCheckinCandidates(
  contacts: CheckinCandidate[],
  opts: { recentlyProposedIds: ReadonlySet<string>; maxPerTick: number },
): CheckinCandidate[] {
  const out: CheckinCandidate[] = [];
  for (const c of contacts) {
    if (out.length >= opts.maxPerTick) break;
    if (!c.name.trim()) continue; // can't address a nameless contact
    if (opts.recentlyProposedIds.has(c.id)) continue; // cooldown — don't re-nudge
    out.push(c);
  }
  return out;
}

// ── Inline self-test (pure selection + shaping — the bug-prone part) ──────────
// Run with: npx tsx src/lib/actions/checkin-proposal.ts --self-test
function selfTest(): void {
  let pass = 0;
  const cases: Array<[string, boolean]> = [];
  const check = (name: string, cond: boolean) => {
    cases.push([name, cond]);
    if (cond) pass++;
  };

  const NOW = Date.UTC(2026, 6, 14, 12, 0, 0); // fixed clock — deterministic
  const daysAgo = (n: number) => new Date(NOW - n * DAY_MS);

  // daysSinceInteraction
  check("null interaction ⇒ null days", daysSinceInteraction(null, NOW) === null);
  check("40 days ago ⇒ 40", daysSinceInteraction(daysAgo(40), NOW) === 40);

  // buildCheckinProposal
  const p = buildCheckinProposal({ id: "e1", name: "Anna", lastInteraction: daysAgo(40) }, NOW);
  check("proposal type is create_commitment", p.type === ACTION_TYPE.CREATE_COMMITMENT);
  check("title carries the shared prefix", p.title === "Check in with Anna");
  check("payload commitment set", p.payload?.commitment === "Reach out to Anna");
  check("payload dueDate is now+3d", p.payload?.dueDate === "2026-07-17");
  check("entityId links the contact", p.entityId === "e1");
  check("reasoning states the gap", (p.reasoning ?? "").includes("40 days"));

  // never-interacted contact still shapes (phrase, not a NaN)
  const pn = buildCheckinProposal({ id: "e2", name: "Bob", lastInteraction: null }, NOW);
  check("null interaction ⇒ 'a long time' phrase", (pn.reasoning ?? "").includes("a long time"));

  // selectCheckinCandidates — cap
  const many: CheckinCandidate[] = Array.from({ length: 10 }, (_, i) => ({
    id: `c${i}`,
    name: `Person ${i}`,
    lastInteraction: daysAgo(30 + i),
  }));
  check(
    "cap honored",
    selectCheckinCandidates(many, { recentlyProposedIds: new Set(), maxPerTick: 3 }).length === 3,
  );
  check(
    "cap keeps first (oldest) N",
    selectCheckinCandidates(many, { recentlyProposedIds: new Set(), maxPerTick: 2 })
      .map((c) => c.id)
      .join(",") === "c0,c1",
  );

  // cooldown filter
  check(
    "recently-proposed skipped",
    selectCheckinCandidates(many, { recentlyProposedIds: new Set(["c0", "c1"]), maxPerTick: 2 })
      .map((c) => c.id)
      .join(",") === "c2,c3",
  );

  // nameless guard
  check(
    "nameless contact skipped",
    selectCheckinCandidates(
      [
        { id: "x", name: "   ", lastInteraction: daysAgo(50) },
        { id: "y", name: "Cleo", lastInteraction: daysAgo(50) },
      ],
      { recentlyProposedIds: new Set(), maxPerTick: 5 },
    )
      .map((c) => c.id)
      .join(",") === "y",
  );

  check(
    "empty input ⇒ empty",
    selectCheckinCandidates([], { recentlyProposedIds: new Set(), maxPerTick: 3 }).length === 0,
  );

  for (const [name, ok] of cases) console.log(`${ok ? "✓" : "✗"} ${name}`);
  const total = cases.length;
  if (pass !== total) {
    console.error(`\n${pass}/${total} passed`);
    process.exit(1);
  }
  console.log(`\n${pass}/${total} passed`);
}

const isDirectCli = process.argv[1]?.endsWith("checkin-proposal.ts");
if (isDirectCli && process.argv.includes("--self-test")) selfTest();
