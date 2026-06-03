/**
 * OrangeCat integration — outbound calls FROM FleetCrown TO OrangeCat.
 *
 * Loop A (subscriptions): every time a FleetCrown user adds a subscription
 * on the /money page, we mirror it into OrangeCat as a `service` record
 * owned by the actor the integration key is bound to (the FleetCrown
 * group actor inside OrangeCat). This gives:
 *   - one ledger across the studio (Mao sees FleetCrown's spend in OC)
 *   - the bitbaum studio narrative its first real data point
 *
 * Auth: `ORANGECAT_API_KEY` (mint at /settings/integrations on OrangeCat,
 * choose the FleetCrown group actor at mint time). The SDK takes care of
 * Idempotency-Key, retries (3, exp backoff honouring Retry-After),
 * timeouts (20s), and the standard error envelope.
 *
 * The sync is FIRE-AND-FORGET — a network blip on OrangeCat must not
 * fail the subscription POST. Failures are logged with enough context
 * to backfill later; user-facing flow is unaffected.
 *
 * Created: 2026-06-03
 */

import { OrangeCatClient, OrangeCatError } from "@orangecat/sdk";

interface SubscriptionForSync {
  id: string;
  name: string;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  frequency: string | null;
  notes: string | null;
}

let cached: OrangeCatClient | null = null;

/**
 * Returns the singleton client when configured, or `null` when the env
 * vars are missing. Callers must handle null — most users / dev
 * environments will not have the integration set up, and the absence is
 * not an error.
 */
export function getOrangeCatClient(): OrangeCatClient | null {
  if (cached) {
    return cached;
  }
  const apiKey = process.env.ORANGECAT_API_KEY;
  if (!apiKey || !apiKey.startsWith("ock_")) {
    return null;
  }
  cached = new OrangeCatClient({
    apiKey,
    baseUrl: process.env.ORANGECAT_API_BASE ?? "https://orangecat.ch",
    userAgent: `fleetcrown/${process.env.npm_package_version ?? "0.1.0"} (+sdk)`,
  });
  return cached;
}

/**
 * Mirror a FleetCrown subscription into OrangeCat as a `service` record.
 * Fire-and-forget — never throws. Returns the OrangeCat service id on
 * success so callers can persist the link later (schema migration is a
 * follow-up; for the spike we log it).
 */
export async function syncSubscriptionToOrangeCat(
  sub: SubscriptionForSync,
): Promise<string | null> {
  const client = getOrangeCatClient();
  if (!client) {
    return null;
  }
  try {
    const service = await client.services.create(
      {
        title: sub.vendor ? `${sub.name} — ${sub.vendor}` : sub.name,
        description: buildDescription(sub),
        category: "subscription",
        fixed_price: sub.amount ?? undefined,
        currency: sub.currency ?? undefined,
      },
      {
        // Stable idempotency key so retried POSTs on the FleetCrown side
        // dedupe at OrangeCat (when server-side dedup lands).
        idempotencyKey: `fleetcrown_sub_${sub.id}`,
      },
    );
    console.log("[orangecat] subscription synced", {
      fleetcrown_subscription_id: sub.id,
      orangecat_service_id: service.id,
    });
    return service.id;
  } catch (err) {
    logSyncFailure(sub, err);
    return null;
  }
}

function buildDescription(sub: SubscriptionForSync): string {
  const freq = sub.frequency ? sub.frequency.toLowerCase() : "recurring";
  const lines = [
    `FleetCrown subscription · ${freq}`,
    sub.notes ? `Note: ${sub.notes}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function logSyncFailure(sub: SubscriptionForSync, err: unknown): void {
  if (err instanceof OrangeCatError) {
    console.warn("[orangecat] sync failed (non-fatal)", {
      fleetcrown_subscription_id: sub.id,
      code: err.code,
      status: err.status,
      message: err.message,
      retryAfter: err.retryAfter,
    });
    return;
  }
  console.warn("[orangecat] sync failed (non-fatal, unknown error)", {
    fleetcrown_subscription_id: sub.id,
    err,
  });
}
