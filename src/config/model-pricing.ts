/**
 * Model pricing — USD per MILLION tokens, SSOT for run cost estimates.
 *
 * Rates are Anthropic API list prices. Fleet agents usually run on a
 * subscription, so the computed number is an ESTIMATE of what the work
 * would have cost at API rates — a comparable unit of spend, not an
 * invoice. Cache multipliers follow the published ratios (read = 0.1×
 * input, 5-minute write = 1.25× input).
 *
 * Matching is by substring on the transcript's `message.model` id, first
 * match wins — keep more-specific ids above less-specific ones. Unknown
 * models still get their TOKENS recorded; only the dollar figure is
 * omitted (priceUsage reports them in `unpricedModels`).
 */
import type { UsageTotals } from "@/lib/usage/claude-transcript-usage";

type ModelRate = {
  /** Substring matched against the model id (e.g. "claude-opus-5"). */
  match: string;
  /** USD per 1M input tokens. */
  inUsd: number;
  /** USD per 1M output tokens. */
  outUsd: number;
};

export const MODEL_RATES: ModelRate[] = [
  { match: "claude-opus-5", inUsd: 5, outUsd: 25 },
  { match: "claude-sonnet-5", inUsd: 3, outUsd: 15 },
  { match: "claude-opus-4", inUsd: 15, outUsd: 75 },
  { match: "claude-sonnet-4", inUsd: 3, outUsd: 15 },
  { match: "claude-haiku-4-5", inUsd: 1, outUsd: 5 },
  { match: "claude-3-5-haiku", inUsd: 0.8, outUsd: 4 },
];

const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

export function rateForModel(modelId: string): ModelRate | null {
  return MODEL_RATES.find((r) => modelId.includes(r.match)) ?? null;
}

export type PricedUsage = {
  /** Estimated USD across all priced models; null when NOTHING matched. */
  costUsd: number | null;
  /** Model ids whose tokens could not be priced (missing from MODEL_RATES). */
  unpricedModels: string[];
};

export function priceUsage(models: Record<string, UsageTotals>): PricedUsage {
  let cost = 0;
  let pricedAny = false;
  const unpricedModels: string[] = [];
  for (const [modelId, t] of Object.entries(models)) {
    const rate = rateForModel(modelId);
    if (!rate) {
      // "unknown" appears when a transcript line has usage but no model id —
      // only worth flagging when it actually carried tokens.
      if (t.input + t.output + t.cacheRead + t.cacheWrite > 0) unpricedModels.push(modelId);
      continue;
    }
    pricedAny = true;
    cost +=
      (t.input / 1_000_000) * rate.inUsd +
      (t.output / 1_000_000) * rate.outUsd +
      (t.cacheRead / 1_000_000) * rate.inUsd * CACHE_READ_MULT +
      (t.cacheWrite / 1_000_000) * rate.inUsd * CACHE_WRITE_MULT;
  }
  return { costUsd: pricedAny ? Math.round(cost * 10_000) / 10_000 : null, unpricedModels };
}
