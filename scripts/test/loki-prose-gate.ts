/**
 * The streamed-prose gate: what an operator is allowed to see while a model is
 * still writing.
 *
 * This is the one new piece of the streaming path that can put plumbing on
 * someone's screen. The buffered path has always stripped `TOOL:` / `ARGS:`
 * lines before anyone saw them (`stripToolCallLines`); a stream that forwarded
 * bytes as they arrived would show the operator a tool call being narrated and
 * then delete it a moment later — and on a weak model, narrating calls in prose
 * is the COMMON case, not the edge case.
 *
 * Pure: no provider, no socket, no model.
 */
import {
  createProseGate,
  normaliseCitations,
  parseTextToolCalls,
  stripReasoning,
  stripToolCallLines,
} from "@/lib/agent/llm";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}\n      expected: ${e}\n      actual:   ${a}`);
    failures++;
  }
}

/**
 * Feed `chunks` through the gate and return what the operator is left looking
 * at — modelling the real client, which CLEARS its preview on `reset` (see
 * `useLokiStream`). Accumulating and ignoring reset would make a retraction
 * look like a leak that was never taken back.
 */
function run(chunks: string[]): string {
  let out = "";
  const gate = createProseGate(
    (t) => {
      out += t;
    },
    () => {
      out = "";
    },
  );
  for (const chunk of chunks) gate.push(chunk);
  gate.end();
  return out;
}

console.log("loki prose gate");

check("plain prose is released", run(["Hello, ", "world."]), "Hello, world.\n");

check(
  "a line is only released once a newline proves it finished",
  (() => {
    let out = "";
    const gate = createProseGate((t) => {
      out += t;
    });
    // `TOO` could still become `TOOL:` — releasing it here is the bug.
    gate.push("TOO");
    return out;
  })(),
  "",
);

check(
  "a narrated tool call never reaches the operator",
  run(["Let me check.\n", "TOOL: search_people\n", 'ARGS: {"query": "Elena"}\n']),
  "Let me check.\n",
);

check(
  "the gate stays shut for the multi-line ARGS object that follows",
  run(["TOOL: search_people\n", "ARGS:\n", "```json\n", '{\n  "query": "Elena"\n}\n', "```\n"]),
  "",
);

check(
  "shape variants models actually emit are all caught",
  run(["- **TOOL:** list_projects\n", "> ARGS = {}\n"]),
  "",
);

check(
  "a tool call split across chunk boundaries is still caught",
  run(["TO", "OL: sea", "rch_people\n"]),
  "",
);

check(
  "the final line is released even with no trailing newline",
  run(["The answer is 42."]),
  "The answer is 42.\n",
);

// The gate's whole purpose is to agree with the buffered path about what counts
// as prose. If these two ever disagree, the preview shows something the saved
// message does not contain — which is the failure the swap-on-`message` rule in
// lib/loki/stream.ts exists to catch, and this test exists to prevent.
const narrated = 'Checking now.\nTOOL: search_people\nARGS: {"query": "Elena"}';
check(
  "gate agrees with stripToolCallLines on the same text",
  run([narrated]).trim(),
  stripToolCallLines(narrated),
);

// And the call it hid must still be the call the loop runs — hiding it from the
// screen must not hide it from the parser.
check(
  "the hidden call is still parsed and executed",
  parseTextToolCalls(narrated, ["search_people"]).map((c) => [c.name, c.args]),
  [["search_people", { query: "Elena" }]],
);

// ── Reasoning leak ─────────────────────────────────────────────────────────
// Observed in production on gemini-flash via the gateway. The PERSISTED answer
// began mid-thought and carried a bare closing tag:
//
//     ...`.
//
//     Everything is clean and strictly compliant.
//     </think>An opinion or assessment is: Not in your data.
//
// Note there is no OPENING tag — the head of the reasoning was lost before it
// reached us, which is exactly why a `<think>[\s\S]*?</think>` regex would have
// matched nothing and left the whole thing on screen.
const LEAKED = [
  "...`.",
  "",
  "Everything is clean and strictly compliant.",
  "</think>An opinion or assessment is: Not in your data.",
].join("\n");

check(
  "a dangling close tag still drops the reasoning before it",
  stripReasoning(LEAKED),
  "An opinion or assessment is: Not in your data.",
);

check(
  "a well-formed reasoning block is dropped whole",
  stripReasoning("<think>weighing the options</think>The answer is 42."),
  "The answer is 42.",
);

check("text with no reasoning is untouched", stripReasoning("Just an answer."), "Just an answer.");

check(
  "only the LAST close tag counts, so a quoted tag mid-reasoning cannot end it early",
  stripReasoning("<think>a</think>b</think>real answer"),
  "real answer",
);

check(
  "reasoning never streams to the screen",
  run(["<think>\n", "I should check the records.\n", "</think>\n", "Heidi looks early.\n"]),
  "Heidi looks early.\n",
);

check(
  "a leak with no opening tag is RETRACTED once the close tag proves what it was",
  run(["Everything is clean.\n", "</think>Heidi looks early.\n"]),
  "Heidi looks early.\n",
);

check(
  "prose before an opening tag is still owed to the reader",
  run(["Here goes. <think>\n", "thinking\n", "</think>\n", "Done.\n"]),
  "Here goes. \nDone.\n",
);

// ── Citation brackets ──────────────────────────────────────────────────────
// Observed live on nemotron: 【F16】 rather than [F16]. Both readers of a
// citation are ASCII-only, so a fullwidth bracket is invisible to the VERIFIER
// (its unknown-citation check silently has nothing to check) and unrecognised
// by the RENDERER (the handle prints verbatim in the prose).
check(
  "a fullwidth citation is normalised to the shape both readers expect",
  normaliseCitations("Heidi is active【F16】."),
  "Heidi is active[F16].",
);

check(
  "a multi-id fullwidth citation keeps every id",
  normaliseCitations("Both hold【F1, D2】here."),
  "Both hold[F1,D2]here.",
);

check(
  "an ASCII citation is left exactly as it is",
  normaliseCitations("Already fine [F8] here."),
  "Already fine [F8] here.",
);

check(
  "fullwidth brackets around non-citations are not touched",
  normaliseCitations("The label 【important】 stays."),
  "The label 【important】 stays.",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ loki prose gate: all checks passed");
