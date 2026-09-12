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
  if (readings.length === 0) return;

  void import("@/db/queries/provider-quota")
    .then(({ recordQuotaReadings }) => recordQuotaReadings(readings))
    .catch(() => undefined);
}
