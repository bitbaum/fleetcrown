// Verifies the sticky-note seam: detection of "add X to my list" /
// "note that X" / "what's on my list", body cleanup, and — just as
// important — the phrases that must FALL THROUGH to dispatch/chat.
// Run: npx tsx scripts/test/sticky-note.ts
import {
  parseStickyNoteRequest,
  formatStickyAddReply,
  formatStickyListReply,
} from "@/lib/loki/sticky-note";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
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

// --- adds: every phrasing the walk workflow produces --------------------
eq(parseStickyNoteRequest("note: buy film"), { kind: "add", body: "buy film" }, "note: prefix");
eq(
  parseStickyNoteRequest("todo: call the landlord"),
  { kind: "add", body: "call the landlord" },
  "todo: prefix",
);
eq(
  parseStickyNoteRequest("sticky note: pay the Hetzner invoice"),
  { kind: "add", body: "pay the Hetzner invoice" },
  "sticky note: prefix",
);
eq(
  parseStickyNoteRequest("note that the invoice is due Friday"),
  { kind: "add", body: "the invoice is due Friday" },
  "note that",
);
eq(
  parseStickyNoteRequest("remind me to bring wine on Tuesday."),
  { kind: "add", body: "bring wine on Tuesday" },
  "remind me to + dictation period stripped",
);
eq(
  parseStickyNoteRequest("remind me about the AOZ contract"),
  { kind: "add", body: "the AOZ contract" },
  "remind me about",
);
eq(
  parseStickyNoteRequest("add pay the invoice to my list"),
  { kind: "add", body: "pay the invoice" },
  "add X to my list",
);
eq(
  parseStickyNoteRequest("put buy sunscreen on the todo list"),
  { kind: "add", body: "buy sunscreen" },
  "put X on the todo list",
);
eq(
  parseStickyNoteRequest("Add to my list: answer Anna's email"),
  { kind: "add", body: "answer Anna's email" },
  "add to my list: X",
);
eq(
  parseStickyNoteRequest("put on my sticky note — email the Verein"),
  { kind: "add", body: "email the Verein" },
  "put on my sticky note — X",
);

// --- reads --------------------------------------------------------------
eq(parseStickyNoteRequest("what's on my list?"), { kind: "read" }, "what's on my list");
eq(
  parseStickyNoteRequest("What is on my sticky note"),
  { kind: "read" },
  "what is on my sticky note",
);
eq(parseStickyNoteRequest("show me my todos"), { kind: "read" }, "show me my todos");
eq(parseStickyNoteRequest("read my list back"), { kind: "read" }, "read my list back");
eq(
  parseStickyNoteRequest("what do I have on my list"),
  { kind: "read" },
  "what do i have on my list",
);

// --- must fall through: dispatch/chat territory -------------------------
ok(
  parseStickyNoteRequest("add dark mode to the settings page") === null,
  "project work with 'add' falls through",
);
ok(
  parseStickyNoteRequest("add rate limiting to my list of concerns in the doc") === null,
  "list-of-X does not anchor",
);
ok(parseStickyNoteRequest("do a code review for kivvi") === null, "dispatch falls through");
ok(parseStickyNoteRequest("what's the status of orangecat?") === null, "chat falls through");
ok(
  parseStickyNoteRequest("note the difference between the two runners") === null,
  "'note the' (no separator) falls through",
);
ok(
  parseStickyNoteRequest("remind me what SSOT stands for") === null,
  "'remind me what' (question) falls through",
);
ok(parseStickyNoteRequest("") === null, "empty falls through");
ok(parseStickyNoteRequest("note:   ") === null, "empty body falls through");

// --- replies ------------------------------------------------------------
ok(formatStickyAddReply("buy film", 1).includes("1 item open"), "add reply singular");
ok(formatStickyAddReply("buy film", 3).includes("3 items open"), "add reply plural");
ok(formatStickyAddReply("buy film", 3).includes("/today#sticky-note"), "add reply links Today");
eq(formatStickyListReply([], 0), "Your sticky note is clear.", "empty list reply");
const listReply = formatStickyListReply([{ body: "a" }, { body: "b" }], 12);
ok(listReply.includes("12 items open"), "list reply honest total");
ok(listReply.includes("…and 10 more"), "list reply names the hidden remainder");
ok(listReply.includes("- a"), "list reply bullets items");
ok(
  formatStickyListReply([{ body: "a" }], 1).includes("/today#sticky-note"),
  "list reply always links Today",
);

console.log(`${pass}/${pass + fail} sticky-note assertions passed`);
if (fail > 0) process.exit(1);
