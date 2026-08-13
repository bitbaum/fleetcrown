/**
 * Live protocol probe — can this model drive Loki's tool loop?
 *
 * Run: npx tsx scripts/probe-loki-models.ts [model ...]
 *      (defaults to a spread from frontier-ish down to tiny)
 *
 * Why this exists as a committed script rather than a one-off: Loki is meant to
 * keep working as the model underneath it changes, and the thing that actually
 * breaks when you swap models is not reasoning quality — it is whether the model
 * emits a tool call the loop can parse. That is cheap to measure and impossible
 * to guess, so measure it before switching, not after.
 *
 * NOT part of `npm run verify`: it costs real tokens and needs GROQ_API_KEY.
 * The env-independent coverage of the same parser lives in
 * scripts/test/agent-tool-loop.ts.
 *
 * Reads: does the model produce a call at all, via which protocol, with correct
 * arguments. A model that scores `calls=0` cannot drive the loop; one that
 * answers via `text` proves the fallback protocol is earning its place.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { callModelWithTools } from "../src/lib/agent/llm";

const DEFAULT_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
];

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_people",
      description: "Look up the operator's contacts by name.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
];

// Mirrors the real system prompt's tool section — including the copyable example,
// which is the part that carries small models.
const SYSTEM = [
  "You are Loki. You answer ONLY from tools; you know nothing about the operator otherwise.",
  "",
  "Call a tool by writing these two lines in your reply, exactly like this:",
  "",
  "TOOL: search_people",
  'ARGS: {"query": "Elena"}',
  "",
  "Write nothing else in a reply that calls a tool.",
].join("\n");

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY not set (put it in .env.local) — nothing to probe.");
    process.exit(2);
  }
  const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_MODELS;
  let usable = 0;

  for (const model of models) {
    try {
      const turn = await callModelWithTools({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "Who is Ilya in my contacts?" },
        ],
        tools: TOOLS,
        validToolNames: ["search_people"],
        model,
        maxTokens: 300,
      });
      const call = turn.toolCalls[0];
      const protocol = call ? (call.id.startsWith("text_") ? "text" : "native") : "-";
      const ok = call?.name === "search_people" && typeof call.args.query === "string";
      if (ok) usable++;
      console.log(
        `${ok ? "✓" : "✗"} ${model.padEnd(40)} calls=${turn.toolCalls.length} via=${protocol.padEnd(6)} args=${JSON.stringify(call?.args ?? {})}`,
      );
    } catch (e) {
      console.log(`✗ ${model.padEnd(40)} ERROR ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
    }
  }

  console.log(`\n${usable}/${models.length} model(s) can drive the loop.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
