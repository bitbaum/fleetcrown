import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";

const secret = "e2e-orangecat-webhook-secret-at-least-32-characters";
process.env.ORANGECAT_WEBHOOK_SECRET = secret;

/**
 * End-to-end proof for the FleetCrown side of the BTC pass rail (scope §4a).
 *
 * scripts/test/orangecat-webhooks.ts only checks the HMAC helper in isolation.
 * This drives the real `/api/orangecat/entitlement` route handler against the
 * real DB: signature verify → actor lookup → idempotent grant insert →
 * users.plan write → dedupe on retry → expiry sweep. It's the synthetic
 * substitute for a live sats payment — everything downstream of "OC's
 * webhook fires" is proven here with zero real money, so the only remaining
 * gap before a genuine purchase is OC-side (a real pass product + the shared
 * secret provisioned on both boxes; see docs/oc-rail-monetization-scope.md).
 *
 * Run: npx tsx scripts/test/orangecat-entitlement-e2e.ts
 * Requires DATABASE_URL pointed at a real (dev) Postgres — creates and
 * deletes one throwaway user; the cascade on oc_billing_grants.user_id
 * cleans up its grant rows too.
 */
async function main() {
  const { POST } = await import("../../src/app/api/orangecat/entitlement/route");
  const { NextRequest } = await import("next/server");
  const { createUser, setUserOrangeCatActorId, getUserById } = await import("../../src/db/queries/users");
  const { listOcBillingGrants, downgradeExpiredPlans } = await import("../../src/db/queries/billing-grants");
  const { db } = await import("../../src/db");
  const { users } = await import("../../src/db/schema");
  const { eq } = await import("drizzle-orm");

  function sign(raw: string): string {
    return "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  }

  function post(body: unknown, signature: string | null) {
    const raw = JSON.stringify(body);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (signature !== null) headers["x-orangecat-signature"] = signature;
    const req = new NextRequest("http://localhost/api/orangecat/entitlement", {
      method: "POST",
      body: raw,
      headers,
    });
    return POST(req);
  }

  const actorId = randomUUID();
  const externalId = `e2e-${randomUUID()}`;
  const user = await createUser({
    name: "OC E2E Test User",
    email: `oc-e2e-${randomUUID()}@example.invalid`,
    passwordHash: "unused",
  });
  assert.ok(user?.id, "test user created");
  await setUserOrangeCatActorId(user.id, actorId);

  try {
    // 1. Unlinked actor -> 200, granted:false, no user touched.
    const unlinkedBody = { actorId: randomUUID(), plan: "pro", externalId: `${externalId}-unlinked`, periodDays: 30 };
    const unlinkedRes = await post(unlinkedBody, sign(JSON.stringify(unlinkedBody)));
    assert.equal(unlinkedRes.status, 200);
    const unlinkedJson = await unlinkedRes.json();
    assert.equal(unlinkedJson.granted, false);
    assert.equal(unlinkedJson.reason, "no-linked-user");

    // 2. Invalid signature -> 401, nothing written.
    const badRes = await post({ actorId, plan: "pro", externalId, periodDays: 30 }, "sha256=" + "0".repeat(64));
    assert.equal(badRes.status, 401);

    // 3. Genuine settlement -> 200, granted:true, plan + expiry set, ledger row written.
    const body = { actorId, plan: "pro", externalId, periodDays: 30, amountBtc: "0.0005" };
    const raw = JSON.stringify(body);
    const res = await post(body, sign(raw));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.granted, true);
    assert.equal(json.plan, "pro");

    const afterGrant = await getUserById(user.id);
    assert.equal(afterGrant?.plan, "pro");
    assert.equal(afterGrant?.planStatus, "active");
    assert.ok(afterGrant?.planExpiresAt, "planExpiresAt set");

    const grants = await listOcBillingGrants(user.id);
    assert.equal(grants.length, 1);
    assert.equal(grants[0].externalId, externalId);
    assert.equal(grants[0].amountBtc, "0.0005");

    // 4. Retried settlement (same externalId) -> idempotent no-op, plan unchanged.
    const retryRes = await post(body, sign(raw));
    assert.equal(retryRes.status, 200);
    const retryJson = await retryRes.json();
    assert.equal(retryJson.granted, false);
    assert.equal(retryJson.deduped, true);
    assert.equal((await listOcBillingGrants(user.id)).length, 1, "no duplicate ledger row");

    // 5. Expiry sweep: backdate the grant, run the daily downgrade cron, confirm it flips to free.
    await db.update(users).set({ planExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, user.id));
    const downgraded = await downgradeExpiredPlans();
    assert.ok(downgraded >= 1, "sweep reports at least this user downgraded");
    const afterSweep = await getUserById(user.id);
    assert.equal(afterSweep?.plan, "free");
    assert.equal(afterSweep?.planStatus, "canceled");
    assert.equal(afterSweep?.planExpiresAt, null);

    console.log("OrangeCat entitlement end-to-end checks passed (signature verify, actor lookup, grant write, dedupe, expiry sweep).");
  } finally {
    await db.delete(users).where(eq(users.id, user.id));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.stack ?? e.message : e);
    process.exit(1);
  });
