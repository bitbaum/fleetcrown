import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Solon → FleetCrown webhook verification, mirroring the OrangeCat rail
 * (orangecat-webhook.ts): Solon signs the raw request body with the shared
 * SOLON_WEBHOOK_SECRET (HMAC-SHA256) and sends `x-solon-signature` as
 * `sha256=<hex>`. Comparison is timing-safe.
 *
 * The webhook is a doorbell, not a courier: a decision.finalized payload only
 * names a decision. If FleetCrown ever ACTS on one, it must fetch the decision
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

/**
 * RESERVED dispatch action type: a future FleetCrown flow where an agent
 * drafts a Solon governance proposal, an operator approves it in the approval
 * queue (the iron rule — no auto-approve — stays intact), and the approved
 * draft is filed on Solon signed with LOKI_SOLON_PRIVKEY. Reserved as a
 * constant now so the name is stable when the flow lands; nothing dispatches
 * it in v1.
 */
export const RESERVED_ACTION_PROPOSE_SOLON_CHANGE = "propose_solon_change" as const;
