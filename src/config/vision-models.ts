/**
 * SSOT for the vision model chain.
 *
 * This file exists because of a class of failure, not a single bug. Loki's
 * screenshot analysis pointed at a hardcoded `GROQ_VISION_MODEL`
 * (meta-llama/llama-4-scout-17b-16e-instruct) that was DECOMMISSIONED — every
 * attached image returned 404, and Groq now offers no vision model at all on
 * this account. That is the fourth time a pinned free model has silently rotted
 * out from under this fleet.
 *
 * Two consequences are encoded here:
 *
 *   1. A CHAIN, not a model. Free-tier models disappear and rate-limit; a single
 *      pin is a scheduled outage. The chain is tried in order and the first one
 *      that answers wins.
 *   2. PROVIDER-AGNOSTIC entries. Every provider here speaks the OpenAI
 *      chat-completions shape, so adding one is a row in this table rather than
 *      a new client. Groq keeps a seat with no default model precisely so that
 *      re-adding one later is a one-line change.
 *
 * `scripts/probe-models.ts` calls every entry with a real image and fails if
 * none answer — so the next rot is caught by a command instead of by a user
 * attaching a screenshot and getting a 404.
 */

export type VisionProvider = {
  /** Display/debug name, and the env prefix for its key. */
  id: string;
  baseUrl: string;
  /** Env var holding the API key. Absent key = entry skipped, not an error. */
  keyEnv: string;
  /** Models to try for this provider, in order. */
  models: string[];
};

/**
 * Default chain, verified live 2026-08-13 against a solid-colour test image:
 *
 *   google/gemma-4-26b-a4b-it:free   → 200, correctly answered "Red"   ✅
 *   google/gemma-4-31b-it:free       → 429 (rate limited, transient)   ⚠ fallback
 *   nvidia/nemotron-nano-12b-v2-vl   → 200 but EMPTY content           ✗ excluded
 *
 * The nemotron exclusion is the interesting one: it returns HTTP 200 with no
 * text, which a naive client reports as a successful empty analysis. Callers
 * must treat empty content as failure — see lib/vision.ts.
 */
export const VISION_CHAIN: VisionProvider[] = [
  {
    id: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    models: ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free"],
  },
  {
    // Groq has NO vision model on this account as of 2026-08-13. The seat is
    // kept so restoring one is a single string, and so the probe reports it.
    id: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    models: process.env.GROQ_VISION_MODEL?.trim() ? [process.env.GROQ_VISION_MODEL.trim()] : [],
  },
];

/**
 * The chain with unusable entries removed: no API key, or no models configured.
 * A missing key is a normal deployment state (FleetCrown had no OpenRouter key
 * at all until this change), so it filters out silently rather than throwing.
 */
export function usableVisionChain(): Array<{ provider: VisionProvider; model: string }> {
  const out: Array<{ provider: VisionProvider; model: string }> = [];
  for (const provider of VISION_CHAIN) {
    if (!process.env[provider.keyEnv]?.trim()) continue;
    for (const model of provider.models) out.push({ provider, model });
  }
  return out;
}
