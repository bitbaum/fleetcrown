import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { stripe, STRIPE_PRICE_IDS, isStripeReady } from "@/lib/stripe";
import { getUserById, updateUserBilling } from "@/db/queries/users";
import { ROUTES } from "@/config/auth";

const PAID_PLANS = ["personal", "pro", "team"] as const;
type PaidPlan = typeof PAID_PLANS[number];

function isPaidPlan(value: string): value is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ plan: string }> }) {
  const { plan } = await params;

  const userId = await getSessionUserId();
  if (!userId) {
    const signInUrl = new URL(ROUTES.SIGN_IN, req.url);
    signInUrl.searchParams.set("callbackUrl", `/api/checkout/${plan}`);
    return NextResponse.redirect(signInUrl);
  }

  if (!isPaidPlan(plan)) {
    return NextResponse.redirect(new URL("/settings", req.url));
  }

  if (!isStripeReady() || !stripe) {
    return NextResponse.redirect(new URL("/settings?billing=not-configured", req.url));
  }

  const user = await getUserById(userId);
  if (!user) return NextResponse.redirect(new URL(ROUTES.SIGN_IN, req.url));

  // Already on this plan
  if (user.plan === plan && user.planStatus === "active") {
    return NextResponse.redirect(new URL("/settings?billing=already-active", req.url));
  }

  const priceId = STRIPE_PRICE_IDS[plan].annual;
  if (!priceId) {
    return NextResponse.redirect(new URL("/settings?billing=not-configured", req.url));
  }

  let customerId = user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    user.email    ?? undefined,
      name:     user.name     ?? undefined,
      metadata: { fleetcrownUserId: userId },
    });
    customerId = customer.id;
    await updateUserBilling(userId, { stripeCustomerId: customerId });
  }

  const origin = new URL(req.url).origin;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode:       "subscription",
    customer:   customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url:  `${origin}/settings?billing=canceled`,
    metadata:    { fleetcrownUserId: userId, plan },
    subscription_data: {
      metadata: { fleetcrownUserId: userId, plan },
    },
  });

  if (!checkoutSession.url) {
    return NextResponse.redirect(new URL("/settings?billing=error", req.url));
  }

  return NextResponse.redirect(checkoutSession.url);
}
