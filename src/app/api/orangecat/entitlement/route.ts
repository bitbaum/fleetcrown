import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PLAN_VALUES } from "@/db/schema/users";
import { getUserByOrangeCatActorId, updateUserBilling } from "@/db/queries/users";
import { recordOcBillingGrant } from "@/db/queries/billing-grants";
import { logDebug } from "@/db/queries/debug-logs";
import { DAY_MS } from "@/lib/constants/time";
import { verifyOrangeCatWebhookSignature } from "@/lib/integrations/orangecat-webhook";

/**
 * OrangeCat-rail entitlement webhook — the settlement signal (scope §4a).
 *
 * When a Bitcoin payment for a FleetCrown pass settles on OrangeCat, OC POSTs
 * here signed with a shared secret. We verify, map the OC actor → FleetCrown
 * user, and grant the plan with a time-boxed expiry (BTC has no native
 * recurring). The oc_billing_grants ledger makes it idempotent — a retried
 * webhook is a no-op — and the same updateUserBilling write the Stripe webhook
 * uses means a BTC-granted plan is identical to a card-granted one.
 *
 * Fail-closed: no shared secret configured → 503 (can't verify, so refuse).
 * The OC emitter IS built — `src/services/fleetcrown/entitlement-notify.ts` in
 * the orangecat repo signs and POSTs here from handlePaymentConfirmed. Both ends
 * stay inert until the shared ORANGECAT_WEBHOOK_SECRET is set on both boxes; once
 * it is, a settled BTC payment on OrangeCat grants the plan here automatically.
 */
const Body = z.object({
  actorId: z.string().uuid(),
  plan: z.enum(PLAN_VALUES as unknown as [string, ...string[]]),
  externalId: z.string().trim().min(1).max(200),
  periodDays: z.number().int().positive().max(3660).default(30),
  amountBtc: z.string().trim().max(32).optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.ORANGECAT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "entitlement webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  if (!verifyOrangeCatWebhookSignature(raw, req.headers.get("x-orangecat-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { actorId, plan, externalId, periodDays, amountBtc } = parsed.data;

  try {
    const user = await getUserByOrangeCatActorId(actorId);
    if (!user) {
      // Payment settled on OC but no FleetCrown account links this actor yet.
      // 200 (don't make OC retry forever) but record it so it's not silently lost.
      await logDebug({
        source: "orangecat/entitlement",
        level: "warn",
        message: "grant for unlinked actor — no FleetCrown user",
        meta: { actorId, plan, externalId },
      }).catch(() => {});
      return NextResponse.json({ ok: true, granted: false, reason: "no-linked-user" });
    }

    const expiresAt = new Date(Date.now() + periodDays * DAY_MS);
    const grant = await recordOcBillingGrant({
      userId: user.id,
      externalId,
      plan: plan as (typeof PLAN_VALUES)[number],
      periodDays,
      expiresAt,
      amountBtc: amountBtc ?? null,
    });
    if (!grant) {
      // Duplicate settlement id — already granted. Idempotent no-op.
      return NextResponse.json({ ok: true, granted: false, deduped: true });
    }

    await updateUserBilling(user.id, {
      plan: plan as (typeof PLAN_VALUES)[number],
      planStatus: "active",
      planExpiresAt: expiresAt,
    });
    await logDebug({
      source: "orangecat/entitlement",
      level: "info",
      message: `BTC pass granted: ${plan} until ${expiresAt.toISOString()}`,
      meta: { userId: user.id, plan, periodDays, externalId, amountBtc: amountBtc ?? null, rail: "orangecat-btc" },
    }).catch(() => {});

    return NextResponse.json({ ok: true, granted: true, plan, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    // A DB blip must not look like a bad request — 500 so OC retries the (idempotent) event.
    console.error("[orangecat/entitlement] failed:", (err as Error).message);
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }
}
