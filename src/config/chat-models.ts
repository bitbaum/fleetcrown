/**
 * SSOT for the CHAT model chain — the models that drive Loki's tool loop.
 *
 * The chain LOGIC now lives in `ai-ration`, extracted after the lesson was paid
 * for twice in this repo: four pinned free models rotted out from under the
 * vision half, and the chat half was still pinned to one vendor whose only
 * degradation was a step-down to a smaller model AT THE SAME VENDOR — drawing on
 * the same org-wide daily budget, so when the day's tokens ran out every link in
 * that "fallback" was already dead. A chain across VENDORS is what buys headroom,
 * because each vendor meters its own free tier independently.
 *
 * What stays here is the wiring: FleetCrown's env prefix (`LOKI_*`, unchanged, so
 * the box needs no new variables) and the call signatures its callers already
 * use. What left is everything that was never FleetCrown-specific.
 *
 * ── Before pinning a model here, PROBE IT ────────────────────────────────────
 * A model that cannot emit a parseable tool call cannot drive the loop, and that
 * is not guessable from its name, size, or docs. `npm run probe:models` calls
 * every link with a real tool and reports which protocol (if any) it answered
 * on. Of the nine free models probed for this chain, FIVE answered only via the
 * TEXT protocol — a native-only loop would have silently lost most of them,
 * which is why `llm.ts` always parses both. The upstream `freeChain()` carries
 * that probe table and the two models excluded on evidence.
 */

import {
  freeChain,
  providerModels as providerModelsOf,
  dayCapacityTokens as capacityOf,
  usableChain,
  chainFrom as chainFromLinks,
  type Provider,
  type Link,
} from "ai-ration";

export type ChatProvider = Provider;
export type ChatLink = Link;

/**
 * The chain, strongest-first: Groq (fastest, loop verified on it) then
 * OpenRouter as a DIFFERENT vendor with a DIFFERENT daily budget.
 *
 * `freeChain("LOKI")` derives the override names this box already sets —
 * LOKI_GROQ_MODELS / LOKI_GROQ_DAILY_TOKENS and the OpenRouter pair — so a
 * rotted model is still routed around by an env change, without a deploy.
 */
export const CHAT_CHAIN: ChatProvider[] = freeChain("LOKI");

/** This provider's models, honouring its env override (read at call time). */
export function providerModels(provider: ChatProvider): string[] {
  return providerModelsOf(provider);
}

/** The day's total budget across every provider we hold a key for. */
export function dayCapacityTokens(): number {
  return capacityOf(CHAT_CHAIN);
}

/** The chain with unusable entries removed: no API key, or no models. */
export function usableChatChain(): ChatLink[] {
  return usableChain(CHAT_CHAIN);
}

/**
 * The chain starting at `model`, or the whole chain when it names no link.
 *
 * The default argument is load-bearing for callers like `llm.ts`, which pass
 * only a model. `LOKI_MODEL` is honoured as a STARTING POINT rather than a hard
 * pin: an operator pinning a model should still get a fallback when that model's
 * vendor runs dry, or the pin quietly restores the single point of failure this
 * chain exists to remove.
 */
export function chainFrom(model: string | undefined, chain = usableChatChain()): ChatLink[] {
  return chainFromLinks(model, chain);
}
