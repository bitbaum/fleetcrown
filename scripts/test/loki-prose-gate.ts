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
import { createProseGate, parseTextToolCalls, stripToolCallLines } from "@/lib/agent/llm";

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

/** Feed `chunks` through the gate and return everything it released. */
function run(chunks: string[]): string {
  let out = "";
  const gate = createProseGate((t) => {
    out += t;
  });
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ loki prose gate: all checks passed");
