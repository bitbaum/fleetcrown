import { readQuota, type QuotaReading } from "@bitbaum/ai-kit";
import type { ChatLink } from "@/config/chat-models";

/**
 * Persist what a vendor just disclosed about its own remaining allowance.
 *
 * Called from the model seam on every response, success or refusal. Three
 * properties, each deliberate:
 *
 * NEVER AWAITED. The operator is waiting on an answer, and a telemetry write
 * has no business adding latency to it — still less failing it. The promise is
 * deliberately floated.
 *
 * NEVER THROWS. Every path is caught. A dashboard that cannot be written is a
 * dashboard that is out of date, which is survivable; an exception here would
 * turn a good answer into a link failure and demote a working vendor off the
 * chain, which is not.
 *
 * IMPORTS THE DATABASE LAZILY. `@/db` throws at MODULE INIT with no connection
 * string, so a static import would drag the whole unit suite into needing a
 * database to test a parser that touches none.
 */
export function recordVendorQuota(headers: Headers, link: ChatLink): void {
  let readings: QuotaReading[] = [];
  try {
    readings = readQuota(headers, link);
  } catch {
    return;
  }
  persist(readings);
}

/**
 * Record that a link was SKIPPED without being called, because the prompt was
 * larger than its per-call budget.
 *
 * This is not a measurement, and it must not read as one. "Never called" and
 * "called and empty" look identical on a dashboard and mean opposite things:
 * one vendor is healthy and unreachable, the other is exhausted. The first
 * version of the settings page reported Groq as "waiting to be measured" while
 * every single turn walked past it — four skips in six hours, at 8,312 and
 * 10,153 tokens against a 5,400 budget. That is not a wait, it is a permanent
 * exclusion with a cause the operator can act on.
 *
 * `remaining` is 0 only because the column is non-null; `source: "preflight"`
 * is what the reader keys on, and the note carries the reason.
 */
export function recordPreflightSkip(link: ChatLink, promptTokens: number, budget: number): void {
  persist([
    {
      provider: link.provider.id,
      model: link.model,
      scope: "requests",
      window: "unknown",
      limit: null,
      remaining: 0,
      resetAt: null,
      source: "preflight",
      observedAt: Date.now(),
      note:
        `skipped without being called: a ~${promptTokens.toLocaleString("en-US")}-token prompt ` +
        `exceeds this model's ${budget.toLocaleString("en-US")}-token budget`,
    },
  ]);
}

/** Fire-and-forget, never throws, database imported lazily. */
function persist(readings: Array<QuotaReading & { note?: string | null }>): void {
  if (readings.length === 0) return;
  void import("@/db/queries/provider-quota")
    .then(({ recordQuotaReadings }) => recordQuotaReadings(readings))
    .catch(() => undefined);
}
