/**
 * Live model probe — is every model this app depends on actually alive?
 *
 * Run: npx tsx scripts/probe-models.ts [chat-model ...]   (npm run probe:models)
 *      (defaults to a spread from frontier-ish down to tiny)
 *
 * Why this exists as a committed script rather than a one-off: Loki is meant to
 * keep working as the model underneath it changes, and the thing that actually
 * breaks when you swap models is not reasoning quality — it is whether the model
 * emits a tool call the loop can parse. That is cheap to measure and impossible
 * to guess, so measure it before switching, not after.
 *
 * Covers BOTH halves, because both have bitten:
 *   CHAT   — can the model emit a tool call the loop can parse?
 *   VISION — does any model in the chain actually read an image?
 *
 * The vision half exists because a pinned free model (Groq's llama-4-scout) was
 * decommissioned and every attached screenshot 404'd, silently, until someone
 * tried one. That was the fourth pinned-free-model rot in this fleet, so the
 * class gets a command instead of another one-off fix: run this before swapping
 * a model, and on any "images stopped working" report.
 *
 * NOT part of `npm run verify`: it costs real tokens and needs live keys.
 * The env-independent coverage of the same parser lives in
 * scripts/test/agent-tool-loop.ts.
 *
 * Reads: does the model produce a call at all, via which protocol, with correct
 * arguments. A model that scores `calls=0` cannot drive the loop; one that
 * answers via `text` proves the fallback protocol is earning its place.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { callModelLinkOnce } from "../src/lib/agent/llm";
import { analyzeImages } from "../src/lib/vision";
import { usableVisionChain } from "../src/config/vision-models";
import { usableChatChain, CHAT_CHAIN, type ChatLink } from "../src/config/chat-models";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_people",
      description: "Look up the operator's contacts by name.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
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

/**
 * Resolve what to probe. No args → the whole configured chain, which is the
 * question that actually matters ("is every fallback I ship real?"). Explicit
 * model ids → those, matched against the chain so they carry their provider,
 * falling back to the first keyed provider for an id nobody advertises yet.
 */
function linksToProbe(): ChatLink[] {
  const chain = usableChatChain();
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) return chain;
  const host = chain[0]?.provider ?? CHAT_CHAIN[0];
  return wanted.map((model) => chain.find((l) => l.model === model) ?? { provider: host, model });
}

async function main() {
  const links = linksToProbe();
  if (links.length === 0) {
    console.error(
      "No chat provider configured — set GROQ_API_KEY or OPENROUTER_API_KEY in .env.local.",
    );
    process.exit(2);
  }
  let usable = 0;

  console.log(`Chat chain (${links.length} link(s)) — can each one actually drive the loop?\n`);
  for (const link of links) {
    const label = `${link.provider.id}/${link.model}`;
    try {
      // callModelLinkOnce, NOT the chain walker: a walk reports whoever
      // answered, which would credit this model with another link's success.
      const turn = await callModelLinkOnce(link, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: "Who is Ilya in my contacts?" },
        ],
        tools: TOOLS,
        validToolNames: ["search_people"],
        maxTokens: 300,
      });
      const call = turn.toolCalls[0];
      const protocol = call ? (call.id.startsWith("text_") ? "text" : "native") : "-";
      const ok = call?.name === "search_people" && typeof call.args.query === "string";
      if (ok) usable++;
      console.log(
        `${ok ? "✓" : "✗"} ${label.padEnd(48)} calls=${turn.toolCalls.length} via=${protocol.padEnd(6)} args=${JSON.stringify(call?.args ?? {})}`,
      );
    } catch (e) {
      console.log(
        `✗ ${label.padEnd(48)} ERROR ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`,
      );
    }
  }

  console.log(`\n${usable}/${links.length} chat link(s) can drive the loop.`);
  if (usable === 0)
    console.log("  ✗ NO chat model answered — Loki's tool loop is DOWN, not degraded.");

  // ── Vision chain ───────────────────────────────────────────────────────────
  // A 2x2 solid-red PNG. Tiny, but it proves the model actually READ the image
  // rather than merely accepting the request — a provider that returns 200 with
  // empty content passes a "did it error" check and fails this one.
  const RED_2X2 =
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GKgImahgEAG1kDCf0X4o8AAAAASUVORK5CYII=";

  const chain = usableVisionChain();
  console.log(`\nVision chain (${chain.length} usable link(s)):`);
  if (chain.length === 0) {
    console.log(
      "  ✗ none — no OPENROUTER_API_KEY and no GROQ_VISION_MODEL. Image attachments WILL fail.",
    );
  }
  let visionOk = 0;
  for (const { provider, model } of chain) {
    try {
      const r = await analyzeImages({
        prompt: "What colour fills this image? Answer with one word.",
        images: [{ mimeType: "image/png", dataBase64: RED_2X2 }],
        maxTokens: 30,
        timeoutMs: 90_000,
      });
      // analyzeImages walks the whole chain itself, so this reports the link
      // that actually answered rather than the one we asked about.
      console.log(`  ✓ ${provider.id}/${model} → answered via ${r.model}: ${r.text.slice(0, 40)}`);
      visionOk++;
      break;
    } catch (e) {
      console.log(
        `  ✗ ${provider.id}/${model} — ${e instanceof Error ? e.message.slice(0, 90) : e}`,
      );
    }
  }
  if (visionOk === 0 && chain.length > 0)
    console.log("  ✗ NO vision model answered — image attachments are broken.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
