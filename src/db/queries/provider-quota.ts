import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { providerQuota, PLATFORM_KEY_OWNER, type ProviderQuota } from "@/db/schema/provider-quota";
import type { QuotaReading } from "@bitbaum/ai-kit";

/**
 * Persist what the vendors last disclosed, and read it back for the operator.
 *
 * Writes are fire-and-forget from the response path: a telemetry write must
 * never fail an answer the user already has. Reads are for the Settings → AI
 * surface, and later for a router that prefers the link with the most headroom.
 */

/**
 * Record observations from one response.
 *
 * Upserts on the counter identity, so the table stays a rollup of "what is
 * true now" rather than growing a row per turn.
 *
 * `observedAt` guards against a stale write landing on top of a fresh one:
 * several turns can be in flight at once and they do not finish in order. A
 * reading older than the stored one is dropped, because a dashboard that
 * flickers backwards teaches people to distrust it.
 */
export async function recordQuotaReadings(
  readings: QuotaReading[],
  keyOwner: string = PLATFORM_KEY_OWNER,
): Promise<void> {
  if (readings.length === 0) return;

  for (const r of readings) {
    const observedAt = new Date(r.observedAt);
    await db
      .insert(providerQuota)
      .values({
        keyOwner,
        provider: r.provider,
        model: r.model,
        scope: r.scope,
        window: r.window,
        quotaLimit: r.limit,
        remaining: r.remaining,
        resetAt: r.resetAt === null ? null : new Date(r.resetAt),
        source: r.source,
        observedAt,
      })
      .onConflictDoUpdate({
        target: [
          providerQuota.keyOwner,
          providerQuota.provider,
          providerQuota.model,
          providerQuota.scope,
          providerQuota.window,
        ],
        set: {
          quotaLimit: r.limit,
          remaining: r.remaining,
          resetAt: r.resetAt === null ? null : new Date(r.resetAt),
          source: r.source,
          observedAt,
        },
        // Out-of-order arrival is normal with concurrent turns, so the update
        // applies only when the incoming reading is at least as fresh as the
        // stored one. `excluded` is the row that failed to insert — comparing
        // the column to itself here would be a tautology that guards nothing.
        setWhere: sql`${providerQuota.observedAt} <= excluded.observed_at`,
      })
      .catch(() => undefined);
  }
}

/** Every counter known for one key owner, freshest first. */
export async function listQuota(keyOwner: string = PLATFORM_KEY_OWNER): Promise<ProviderQuota[]> {
  return db
    .select()
    .from(providerQuota)
    .where(eq(providerQuota.keyOwner, keyOwner))
    .orderBy(desc(providerQuota.observedAt))
    .catch(() => []);
}

// A single-counter read (for a router that prefers the link with the most
// headroom) is deliberately NOT here yet. It was written, and the dead-exports
// ratchet correctly refused it: nothing calls it, and an export with no caller
// is how a query layer fills with functions nobody can safely change because
// nobody knows whether they work. It is four lines when the router needs it.
