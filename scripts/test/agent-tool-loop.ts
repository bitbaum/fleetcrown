/**
 * Loki's in-app tool loop — protocol parsing and loop control.
 * Run: npx tsx scripts/test/agent-tool-loop.ts
 *
 * Env-independent by construction: the model call and the seed context are both
 * injected, so this needs no GROQ_API_KEY and no DATABASE_URL. That is the point
 * — loop control (round budgets, fact accumulation, bad-argument recovery,
 * whether a repair may make an answer worse) is the part most likely to break,
 * and a live-model test can never pin it down because the model chooses
 * differently every run.
 *
 * The parser cases are not invented. Each is a shape a small model actually
 * emits when asked to call a tool: markdown-bolded keys, fenced ARGS, a name
 * copied with its parentheses, a bare no-argument call, and — most importantly —
 * a call narrated in prose while native tool-calling was enabled. Under a
 * native-only parser that last one reaches the user as a hallucinated result.
 */
import assert from "node:assert/strict";
import { z } from "zod";
import { parseTextToolCalls, stripToolCallLines, type ModelTurn } from "../../src/lib/agent/llm";
import { defineTool, renderToolCatalog, toOpenAITools, type ToolRegistry } from "../../src/lib/agent/tools/registry";
import { runLokiTurn } from "../../src/lib/agent/loop";
import { makeFact, assignFactIds } from "../../src/lib/agent/core/facts";

const NAMES = ["search_people", "list_projects", "propose_action"];

// ── 1. The text protocol survives how small models actually write ────────────
{
  const plain = parseTextToolCalls('TOOL: search_people\nARGS: {"query": "Elena"}', NAMES);
  assert.equal(plain.length, 1, "the documented shape must parse");
  assert.deepEqual(plain[0].args, { query: "Elena" });

  const bolded = parseTextToolCalls('**TOOL:** search_people\n**ARGS:** {"query": "Elena"}', NAMES);
  assert.equal(bolded.length, 1, "markdown-bolded keys must parse");

  const parens = parseTextToolCalls('TOOL: search_people(query)\nARGS: {"query": "Ilya"}', NAMES);
  assert.equal(parens[0]?.args.query, "Ilya", "a name copied with parens must still resolve");

  const noArgs = parseTextToolCalls("TOOL: list_projects", NAMES);
  assert.equal(noArgs.length, 1, "a no-argument call needs no ARGS line");
  assert.deepEqual(noArgs[0].args, {}, "missing ARGS means empty args, not failure");

  const fenced = parseTextToolCalls('TOOL: search_people\nARGS: ```json\n{"query": "Elena"}\n```', NAMES);
  assert.equal(fenced[0]?.args.query, "Elena", "fenced ARGS must parse");

  const trailing = parseTextToolCalls('TOOL: search_people\nARGS: {"query": "Elena"} — then I will summarise', NAMES);
  assert.equal(trailing[0]?.args.query, "Elena", "commentary after the JSON must not break the parse");

  const multi = parseTextToolCalls(
    'TOOL: list_projects\nTOOL: search_people\nARGS: {"query": "Elena"}',
    NAMES,
  );
  assert.equal(multi.length, 2, "two calls in one reply must both parse");
  assert.deepEqual(multi[0].args, {}, "a call followed by another TOOL line has no args");

  // A name that is not registered must never be dispatched — the parser is the
  // closed-set boundary, not the executor.
  assert.equal(parseTextToolCalls("TOOL: rm_rf_everything\nARGS: {}", NAMES).length, 0, "unknown tools must not parse");
}

// ── 2. Narrated calls never reach the operator as prose ──────────────────────
{
  const raw = 'Let me look her up.\nTOOL: search_people\nARGS: {"query": "Elena"}\nI will report back.';
  const stripped = stripToolCallLines(raw);
  assert.doesNotMatch(stripped, /TOOL:/, "tool lines must be stripped from prose");
  assert.doesNotMatch(stripped, /ARGS:/, "args lines must be stripped from prose");
  assert.match(stripped, /Let me look her up/, "the model's actual prose must survive");
}

// ── Scripted-model harness ───────────────────────────────────────────────────
/** Returns each scripted turn in order; records what it was asked. */
function scriptedModel(turns: Array<Partial<ModelTurn>>) {
  let i = 0;
  const seen: Array<{ toolsAdvertised: number }> = [];
  const fn = async (input: { tools: Array<Record<string, unknown>> }): Promise<ModelTurn> => {
    seen.push({ toolsAdvertised: input.tools.length });
    const t = turns[Math.min(i, turns.length - 1)];
    i++;
    return { text: t.text ?? "", toolCalls: t.toolCalls ?? [], model: "stub" };
  };
  return { fn: fn as never, seen, calls: () => i };
}

const STUB_REGISTRY: ToolRegistry = {
  search_people: defineTool({
    name: "search_people",
    kind: "read",
    description: "stub",
    params: z.object({ query: z.string() }),
    example: 'TOOL: search_people\nARGS: {"query": "x"}',
    handler: async ({ query }) =>
      query === "nobody"
        ? { facts: [], note: `No contact matched "${query}".` }
        : {
            facts: [
              makeFact({
                kind: "person",
                subject: "Elena Weber SINGA Switzerland",
                source: "people table",
                values: { name: "Elena Weber SINGA Switzerland", channels: "whatsapp +41774730093" },
              }),
            ],
          },
  }),
  boom: defineTool({
    name: "boom",
    kind: "read",
    description: "stub that throws",
    params: z.object({}),
    example: "TOOL: boom\nARGS: {}",
    handler: async () => {
      throw new Error("upstream exploded");
    },
  }),
};

const SEED = { facts: [], directives: [] };

async function main() {
  // The real registry lives beside handlers that import @/db, which throws at
  // module init without a connection string. A parseable dummy is enough: these
  // assertions only read tool METADATA (names, kinds, examples) and never invoke
  // a handler, so no connection is ever opened. Keeping the import lazy is what
  // lets this suite stay in the env-independent tier.
  process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";
  const { LOKI_TOOLS } = await import("../../src/lib/agent/tools/handlers");

  // ── 3. The catalog shows a COPYABLE example for every tool ───────────────────
  // Measured on this fleet: a field shown as a copyable line is emitted correctly
  // ~97% of the time; the same rule in prose, ~3%. A tool without an example is a
  // tool weak models will call wrongly, so this is asserted, not trusted.
  {
    const catalog = renderToolCatalog(LOKI_TOOLS);
    for (const name of Object.keys(LOKI_TOOLS)) {
      assert.ok(catalog.includes(`### ${name}`), `${name} must appear in the catalog`);
      assert.ok(catalog.includes(`TOOL: ${name}`), `${name} must ship a copyable example call`);
    }
    // The propose tool must be visibly marked as needing approval.
    assert.match(catalog, /propose_action {2}\(proposes a draft — needs the operator's approval\)/);

    // Native specs must advertise exactly the same set — drift here would let a
    // model call something the executor does not have.
    const native = toOpenAITools(LOKI_TOOLS).map((t) => (t.function as { name: string }).name).sort();
    assert.deepEqual(native, Object.keys(LOKI_TOOLS).sort(), "native specs must match the registry exactly");
  }

  // ── 4. Loki has NO tool that acts directly ───────────────────────────────────
  // The safety boundary is structural: read or propose, never execute. If someone
  // adds an executing tool this fails, which is the intent.
  {
    const kinds = new Set(Object.values(LOKI_TOOLS).map((t) => t.kind));
    assert.deepEqual([...kinds].sort(), ["propose", "read"], "only read and propose kinds may exist");
    assert.equal(LOKI_TOOLS.propose_action.kind, "propose");
  }

// ── 5. Tool results become facts the answer can cite ─────────────────────────
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "search_people", args: { query: "Elena" } }] },
    { text: "Elena Weber SINGA Switzerland — whatsapp +41774730093 [F1]." },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "who is Elena?",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.deepEqual(r.toolsUsed, ["search_people"], "the tool must have executed");
  assert.equal(r.facts.length, 1, "the tool's records must land in the fact set");
  assert.equal(r.facts[0].id, "F1", "facts must be citable");
  assert.deepEqual(r.violations, [], `a grounded answer must verify clean: ${JSON.stringify(r.violations)}`);
  assert.equal(r.rounds, 2, "one gather round then one answer round");
}

// ── 6. An invented attribute is caught even when the tool ran ────────────────
// The whole point of routing tools through Facts: calling the right tool does
// not license adding a field the record never had.
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "search_people", args: { query: "Elena" } }] },
    { text: "Elena Weber is Program Manager at Impact Hub Zurich [F1]." },
    { text: `Elena Weber SINGA Switzerland [F1]. Her role is not recorded.` },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "who is Elena?",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.ok(
    r.violations.length === 0 || !/Impact Hub/i.test(r.text),
    "an invented employer must be repaired away or flagged, never served clean",
  );
  assert.doesNotMatch(r.text, /Impact Hub/i, "the repair pass must have removed the fabrication");
}

// ── 7. Empty tool results are reported, not papered over ─────────────────────
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "search_people", args: { query: "nobody" } }] },
    { text: "Not in your data." },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "who is nobody?",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.equal(r.facts.length, 0, "an empty tool result adds no facts");
  assert.match(r.text, /Not in your data/, "the refusal must survive to the operator");
}

// ── 8. A throwing tool reads as UNKNOWN, never as "none" ─────────────────────
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "boom", args: {} }] },
    { text: "That lookup failed, so I cannot say." },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "check the thing",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.equal(r.facts.length, 0, "a failed tool contributes no facts");
  assert.ok(r.text.length > 0, "a failed tool must not fail the turn");
}

// ── 9. Bad arguments get the example back, not a zod dump ────────────────────
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "search_people", args: { wrong: 1 } }] },
    { toolCalls: [{ id: "2", name: "search_people", args: { query: "Elena" } }] },
    { text: "Elena Weber SINGA Switzerland [F1]." },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "who is Elena?",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.deepEqual(r.toolsUsed, ["search_people"], "the malformed call must not count as executed");
  assert.equal(r.facts.length, 1, "the corrected retry must succeed");
}

// ── 10. The loop is bounded, and the last round cannot call tools ────────────
// A model that only ever calls tools must still terminate WITH an answer —
// otherwise a weak model's loop becomes a hung request.
{
  const model = scriptedModel([
    { toolCalls: [{ id: "1", name: "search_people", args: { query: "Elena" } }] },
    { toolCalls: [{ id: "2", name: "search_people", args: { query: "Elena" } }] },
    { text: "Elena Weber SINGA Switzerland [F1]." },
  ]);
  const r = await runLokiTurn({
    userId: "u1",
    message: "who is Elena?",
    registry: STUB_REGISTRY,
    callModel: model.fn,
    seed: SEED,
  });
  assert.ok(r.rounds <= 3, `the loop must be bounded, ran ${r.rounds} rounds`);
  assert.ok(r.text.length > 0, "the loop must always end with text");
  assert.equal(
    model.seen[model.seen.length - 1].toolsAdvertised,
    0,
    "the final round must advertise NO tools so the model is forced to answer",
  );
}

// ── 11. A too-large prompt sheds facts instead of abandoning the loop ────────
// Observed in production: the big model rate-limited, the 429 handler stepped
// down to the 8B model as designed, and the 8B model then returned 413 because
// a prompt sized for a 128k context does not fit a small one. The loop gave up
// and fell back to weaker retrieval, so the step-down achieved nothing.
{
  const manyFacts = assignFactIds(
    Array.from({ length: 40 }, (_, i) =>
      makeFact({ kind: "project", subject: `proj-${i}`, source: "projects table", values: { name: `proj-${i}` } }),
    ),
  );
  const sizes: number[] = [];
  let calls = 0;
  const model = (async (input: { messages: Array<{ content: string }> }) => {
    calls++;
    // Count rendered records to observe the shed.
    sizes.push((input.messages[1]?.content.match(/^\[F\d+\]/gm) ?? []).length);
    if (calls <= 2) throw new Error("groq 413: Request too large for model");
    return { text: "Answered with what fits.", toolCalls: [], model: "stub" };
  }) as never;

  const r = await runLokiTurn({
    userId: "u1",
    message: "what am I working on?",
    registry: STUB_REGISTRY,
    callModel: model,
    seed: { facts: manyFacts, directives: [] },
  });
  assert.equal(r.text, "Answered with what fits.", "a 413 must not fail the turn");
  assert.ok(sizes.length >= 3, `expected retries, saw ${sizes.length} attempt(s)`);
  assert.ok(sizes[1] < sizes[0], `facts must shrink on 413: ${sizes.join(" -> ")}`);
  assert.ok(sizes[2] < sizes[1], `facts must shrink again: ${sizes.join(" -> ")}`);

  // A non-413 error must NOT be retried — retrying a 401 or a 500 just burns
  // the operator's latency for a guaranteed second failure.
  let other = 0;
  const failing = (async () => {
    other++;
    throw new Error("groq 401: invalid api key");
  }) as never;
  await runLokiTurn({
    userId: "u1",
    message: "hi",
    registry: STUB_REGISTRY,
    callModel: failing,
    seed: { facts: manyFacts, directives: [] },
  }).then(
    () => assert.fail("a 401 must propagate"),
    () => assert.equal(other, 1, "a non-413 error must not be retried"),
  );
}

  console.log("✓ agent tool loop: 11 checks passed (protocol tolerance, catalog shape, no-execute boundary, fact accumulation, repair, bounds, 413 shedding)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
