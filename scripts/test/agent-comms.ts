// Verifies the cross-agent inbox parser (src/lib/agent-comms.ts) against the
// real PROTOCOL.md message shapes seen in ~/.claude/cross-project/inbox-*.md.
// Run: npx tsx scripts/test/agent-comms.ts
import { parseInbox, dedupeAndSort, extractSchema } from "@/lib/agent-comms";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(
      `✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}
function ok(cond: boolean, label: string) {
  eq(cond, true, label);
}

// A realistic inbox: preamble, timed + date-only headers, bold and plain Re:,
// `---` separators, and a trailing READ marker — mirrors inbox-fleetcrown.md.
const INBOX = `# Inbox — @fleetcrown

**Status**: ACTIVE — this preamble is not a message.

---
## 2026-07-06 13:16 — from @kivvi to @fleetcrown
**Re**: handshake

First body line.
Second body line.

---
## 2026-07-06 — from @fleetcrown to @kivvi
Re: collaboration protocol

Agreed on all points.

READ: 2026-07-06 13:58
`;

const msgs = parseInbox(INBOX);

// The preamble is not a message; exactly the two `##` blocks are.
eq(msgs.length, 2, "parses two messages, ignores preamble");

const [m1, m2] = msgs;
eq(m1.ts, "2026-07-06 13:16", "timed header ts");
eq(m1.from, "kivvi", "from");
eq(m1.to, "fleetcrown", "to");
eq(m1.re, "handshake", "bold **Re** parsed");
eq(m1.body, "First body line.\nSecond body line.", "body has no --- delimiter");
eq(m1.read, false, "unread when no READ marker");

eq(m2.ts, "2026-07-06", "date-only header ts");
eq(m2.re, "collaboration protocol", "plain 'Re:' parsed (not just bold)");
eq(m2.read, true, "READ marker flips read=true");
ok(!m2.body.includes("READ:"), "READ line excluded from body");
ok(!m2.body.includes("---"), "trailing rule excluded from body");

// Same sender/recipient/date but different content must stay distinct — the
// old `from->to@ts` id would have collapsed these when ts is date-only.
const SAME_TS = `## 2026-07-06 — from @a to @b
first

---
## 2026-07-06 — from @a to @b
second
`;
const two = dedupeAndSort(parseInbox(SAME_TS));
eq(two.length, 2, "same date, different body → not deduped");

// A byte-identical message copied into both inboxes IS one message.
const dupes = dedupeAndSort([...parseInbox(SAME_TS), ...parseInbox(SAME_TS)]);
eq(dupes.length, 2, "identical copies deduped to originals");

// Reverse-chronological: timed sorts after date-only the same day.
const ORDER = `## 2026-07-05 09:00 — from @a to @b
old

---
## 2026-07-06 13:16 — from @a to @b
new
`;
const sorted = dedupeAndSort(parseInbox(ORDER));
eq(sorted[0].body, "new", "newest first");
eq(sorted[1].body, "old", "oldest last");

// Schema extraction: type/status lifted from a JSON payload in the body,
// tolerant of pretty-printing and surrounding prose; absent → undefined.
const RESULT = `## 2026-07-06 13:58 — from @kivvi to @fleetcrown
**Re**: round-trip proof

Round-trip PROOF:
{ "id":"t0-handshake", "from":"kivvi", "to":"fleetcrown", "type":"result",
  "status":"done" }
Evidence: green.
`;
const r = parseInbox(RESULT)[0];
eq(r.type, "result", "type lifted from body JSON");
eq(r.status, "done", "status lifted from body JSON");

eq(extractSchema("prose only, no payload").type, undefined, "no payload → type undefined");
eq(extractSchema('"type":"escalation"').type, "escalation", "escalation type parsed");
eq(extractSchema('"type":"bogus"').type, undefined, "unknown type ignored (constrained set)");
eq(extractSchema('"status":"in_progress"').status, "in_progress", "multi-word status parsed");
eq(r.body.includes('"type":"result"'), true, "body remains SSOT (payload not stripped)");

console.log(`${pass}/${pass + fail} agent-comms cases passed`);
if (fail > 0) process.exit(1);
