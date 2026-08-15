/**
 * SSOT for the CHAT model chain — the models that drive Loki's tool loop.
 *
 * This is the sibling of `vision-models.ts`, and it exists for the same reason,
 * learned the same way. That file's comment records the lesson after four
 * pinned free models rotted out from under this fleet: "A CHAIN, not a model.
 * Free-tier models disappear and rate-limit; a single pin is a scheduled
 * outage." The vision half learned it. The chat half did not — `llm.ts` was
 * pinned to one vendor, and its only degradation was a step-down to a SMALLER
 * MODEL AT THE SAME VENDOR, which draws on the same org-wide daily budget. So
 * when the day's tokens ran out, every link in the "fallback" was already dead.
 *
 * A chain across VENDORS is what actually buys headroom, because each vendor
 * meters its own free tier independently. Ordering is strongest-first: the loop
 * walks down only as links refuse it, so a healthy day still answers on the best
 * model available.
 *
 * Every provider here speaks the OpenAI chat-completions shape, so adding one is
 * a row in this table rather than a new client.
 *
 * ── Before pinning a model here, PROBE IT ────────────────────────────────────
 * A model that cannot emit a parseable tool call cannot drive the loop, and that
 * is not guessable from its name, size, or docs. `npm run probe:models` calls
 * every link with a real tool and reports which protocol (if any) it answered
 * on. The free-model rot history in this fleet is entirely made of models that
 * looked fine on paper.
 */

import { GROQ_FAST_MODEL } from "@/lib/groq";

export type ChatProvider = {
  /** Display/debug name; also the prefix reported back as the model id. */
  id: string;
  baseUrl: string;
  /** Env var holding the API key. Absent key = entry skipped, not an error. */
  keyEnv: string;
  /**
   * Env var that REPLACES `models` when set (comma/space separated).
   * Read at call time, not at import: the point of this override is routing
   * around a model that rotted, and a value frozen at module load would need a
   * redeploy to take effect — which is exactly the delay it exists to avoid.
   */
  modelsEnv: string;
  /** Models to try for this provider, in order. */
  models: string[];
  /**
   * Tokens this vendor's FREE tier grants per day, summed into the pool that
   * fair-share rations. An ESTIMATE, and deliberately conservative: handing out
   * shares of capacity that turns out not to exist produces the exact wall the
   * rationing exists to prevent, only later in the day and harder to diagnose.
   * Override per box once measured.
   */
  dailyTokens: number;
  /** Env var overriding `dailyTokens` at call time. */
  dailyTokensEnv: string;
};

/** Split a comma/space separated env override into model ids. */
function fromEnv(name: string): string[] | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const models = raw.split(/[\s,]+/).filter(Boolean);
  return models.length > 0 ? models : null;
}

/** This provider's models, honouring its env override. */
export function providerModels(provider: ChatProvider): string[] {
  return fromEnv(provider.modelsEnv) ?? provider.models;
}

/**
 * The chain, strongest-first.
 *
 * Groq leads because it is the fastest and the loop is already verified on it.
 * OpenRouter follows as a DIFFERENT vendor with a DIFFERENT daily budget — the
 * whole point of the chain.
 *
 * ── Every entry below was probed live on 2026-08-15 ──────────────────────────
 * The free catalogue was enumerated by filtering `/api/v1/models` for
 * `pricing.prompt == "0"` and `supported_parameters` containing `tools`, then
 * each candidate was sent a real tool call. Protocol each one answered on:
 *
 *   groq/llama-3.3-70b-versatile              native
 *   groq/llama-3.1-8b-instant                 text
 *   openai/gpt-oss-20b:free                   native
 *   nvidia/nemotron-3-super-120b-a12b:free    native
 *   nvidia/nemotron-3.5-lightning:free        native
 *   google/gemma-4-26b-a4b-it:free            text
 *   nvidia/nemotron-3-nano-30b-a3b:free       text
 *   cohere/north-mini-code:free               text
 *   openrouter/free                           text
 *
 * Note that FIVE of the nine answer only via the TEXT protocol. A native-only
 * loop would have silently lost most of this chain — which is the concrete
 * payoff of `llm.ts` always parsing both.
 *
 * Deliberately excluded, both verified rather than assumed:
 *   google/gemma-4-31b-it:free        — "Provider returned error" on probe
 *   nvidia/nemotron-nano-12b-v2-vl    — returns HTTP 200 with EMPTY content
 *                                       (see vision-models.ts; a naive client
 *                                       reads that as a successful empty answer)
 *
 * `openrouter/free` sits last on purpose: it is an auto-router across the free
 * catalogue, so it keeps working when a specific id above it is retired. That
 * makes it the link most likely to survive the next rot, and the least
 * predictable in quality — exactly the right shape for a last resort.
 *
 * Overridable per provider (LOKI_GROQ_MODELS / LOKI_OPENROUTER_MODELS) so a
 * rotted model can be routed around by an env change on the box, without a
 * deploy.
 */
export const CHAT_CHAIN: ChatProvider[] = [
  {
    id: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelsEnv: "LOKI_GROQ_MODELS",
    models: [GROQ_FAST_MODEL, "llama-3.1-8b-instant"],
    // Not a guess: Groq's own TPD refusal names it — "on tokens per day (TPD):
    // Limit 100000". Org-wide, so the dispatch strategist and form-assist draw
    // from this same pool.
    dailyTokens: 100_000,
    dailyTokensEnv: "LOKI_GROQ_DAILY_TOKENS",
  },
  {
    id: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelsEnv: "LOKI_OPENROUTER_MODELS",
    models: [
      "openai/gpt-oss-20b:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-26b-a4b-it:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "cohere/north-mini-code:free",
      "openrouter/free",
    ],
    // OpenRouter meters its free tier in REQUESTS per day, not tokens, and the
    // cap depends on the account's credit balance — so this is a translation,
    // not a published figure. Set at the low end on purpose: under-promising
    // rations a little tightly, over-promising hands out shares of capacity
    // that does not exist. Calibrate with LOKI_OPENROUTER_DAILY_TOKENS.
    dailyTokens: 100_000,
    dailyTokensEnv: "LOKI_OPENROUTER_DAILY_TOKENS",
  },
];

/**
 * The day's total budget: every provider we hold a key for.
 *
 * Only KEYED providers count. A vendor whose key is absent contributes nothing
 * however generous its tier, and counting it would ration users against
 * capacity that cannot be reached — the same failure as an optimistic estimate,
 * just with an obvious cause.
 */
export function dayCapacityTokens(): number {
  let total = 0;
  for (const provider of CHAT_CHAIN) {
    if (!process.env[provider.keyEnv]?.trim()) continue;
    const override = Number(process.env[provider.dailyTokensEnv]);
    total += Number.isFinite(override) && override >= 0 ? override : provider.dailyTokens;
  }
  return total;
}

export type ChatLink = { provider: ChatProvider; model: string };

/**
 * The chain with unusable entries removed: no API key, or no models configured.
 *
 * A missing key is a normal deployment state — most boxes carry one vendor's
 * key, not every vendor's — so it filters out silently rather than throwing.
 */
export function usableChatChain(): ChatLink[] {
  const out: ChatLink[] = [];
  for (const provider of CHAT_CHAIN) {
    if (!process.env[provider.keyEnv]?.trim()) continue;
    for (const model of providerModels(provider)) out.push({ provider, model });
  }
  return out;
}

/**
 * The chain starting at `model`, or the whole chain when it names no link.
 *
 * `LOKI_MODEL` historically pinned one model. Honouring it as a STARTING POINT
 * rather than a hard pin keeps the escape hatch ("run Loki on this model") while
 * refusing to reintroduce the single point of failure this file exists to
 * remove: an operator pinning a model should still get a fallback when that
 * model's vendor runs dry.
 */
export function chainFrom(model: string | undefined, chain = usableChatChain()): ChatLink[] {
  const wanted = model?.trim();
  if (!wanted) return chain;
  const at = chain.findIndex((l) => l.model === wanted);
  if (at >= 0) return chain.slice(at);
  // A model nobody advertises is still a legitimate request (a private
  // deployment, a just-released id). Try it against the first provider that has
  // a key, then fall through to the ordinary chain rather than dead-ending.
  const host = chain[0];
  return host ? [{ provider: host.provider, model: wanted }, ...chain] : [];
}
