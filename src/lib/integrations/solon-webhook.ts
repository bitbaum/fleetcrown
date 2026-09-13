import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Solon → Loki webhook verification, mirroring the OrangeCat rail
 * (orangecat-webhook.ts): Solon signs the raw request body with the shared
 * SOLON_WEBHOOK_SECRET (HMAC-SHA256) and sends `x-solon-signature` as
 * `sha256=<hex>`. Comparison is timing-safe.
 *
 * The webhook is a doorbell, not a courier: a decision.finalized payload only
 * names a decision. If Loki ever ACTS on one, it must fetch the decision
 * document from Solon and re-verify every Bitcoin vote signature against its
 * own pinned keys first (the pattern OrangeCat's decision-verify implements).
 * v1 only records the doorbell.
 */
export function verifySolonWebhookSignature(
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
