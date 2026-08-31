import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyOrangeCatWebhookSignature } from "../../src/lib/integrations/orangecat-webhook";

/**
 * Cross-repo contract test for the OrangeCat → FleetCrown webhook HMAC.
 *
 * Both receivers (/api/orangecat/entitlement, /api/orangecat/events) trust
 * verifyOrangeCatWebhookSignature. OrangeCat's emitters
 * (src/services/fleetcrown/entitlement-notify.ts in the orangecat repo) sign
 * exactly like `ocSign` below: `sha256=` + hex HMAC-SHA256 of the raw JSON body
 * with the shared ORANGECAT_WEBHOOK_SECRET. If either side's scheme drifts,
 * this fails before a silently-rejected settlement ships.
 */
const secret = "shared-orangecat-webhook-secret-at-least-32ch";

/** The exact header OrangeCat produces. */
function ocSign(rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

// The exact bodies OrangeCat POSTs (mirrors the emitters' JSON.stringify shape).
const entitlementBody = JSON.stringify({
  actorId: "11111111-1111-1111-1111-111111111111",
  plan: "pro",
  externalId: "pi_abc123",
  periodDays: 30,
  amountBtc: "0.0005",
});
const eventBody = JSON.stringify({
  type: "payment.settled",
  entityType: "project",
  entityId: "22222222-2222-2222-2222-222222222222",
  title: "Neighbourhood fund",
  amountBtc: "0.01",
  externalId: "pi_def456",
});

// 1. A genuine OrangeCat-signed body verifies for both rails.
assert.equal(
  verifyOrangeCatWebhookSignature(entitlementBody, ocSign(entitlementBody), secret),
  true,
);
assert.equal(verifyOrangeCatWebhookSignature(eventBody, ocSign(eventBody), secret), true);

// 2. A bare hex (no "sha256=" prefix) is accepted for forward-compat.
const bareHex = createHmac("sha256", secret).update(entitlementBody).digest("hex");
assert.equal(verifyOrangeCatWebhookSignature(entitlementBody, bareHex, secret), true);

// 3. Tampered body → reject (signature no longer matches the raw body).
assert.equal(
  verifyOrangeCatWebhookSignature(entitlementBody + " ", ocSign(entitlementBody), secret),
  false,
);

// 4. Wrong secret → reject.
assert.equal(
  verifyOrangeCatWebhookSignature(entitlementBody, ocSign(entitlementBody), "not-the-secret"),
  false,
);

// 5. Missing header → reject (fail-closed).
assert.equal(verifyOrangeCatWebhookSignature(entitlementBody, null, secret), false);

// 6. Garbage / non-hex header → reject, never throw.
assert.equal(verifyOrangeCatWebhookSignature(entitlementBody, "sha256=not-hex!!", secret), false);
assert.equal(verifyOrangeCatWebhookSignature(entitlementBody, "", secret), false);

// 7. Right length but wrong bytes → reject (timing-safe path still says no).
const wrongHex = "0".repeat(64);
assert.equal(verifyOrangeCatWebhookSignature(entitlementBody, `sha256=${wrongHex}`, secret), false);

console.log("OrangeCat webhook HMAC contract checks passed.");
