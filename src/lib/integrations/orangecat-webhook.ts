import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shared HMAC verification for the OrangeCat → FleetCrown webhook rail.
 *
 * Both receivers (/api/orangecat/entitlement and /api/orangecat/events) verify
 * the exact same way: OrangeCat signs the raw request body with the shared
 * ORANGECAT_WEBHOOK_SECRET (HMAC-SHA256) and sends it as `x-orangecat-signature`.
 * The OrangeCat emitter formats the header as `sha256=<hex>`; a bare `<hex>` is
 * also accepted for forward-compatibility. Comparison is timing-safe.
 *
 * This is the single source of truth for that check — previously the identical
 * function was copy-pasted into both route files, so a change to one could
 * silently drift from the other.
 */
export function verifyOrangeCatWebhookSignature(
  raw: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.startsWith("sha256=") ? header.slice(7) : header;
  let a: Buffer;
  try {
    a = Buffer.from(got, "hex");
  } catch {
    return false;
  }
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
