import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_PRICE_IDS, isStripeReady } from "@/lib/stripe";
import { getCurrentUserId } from "@/lib/session";
import { getUserById, updateUserBilling } from "@/db/queries/users";
import { readJsonBody, z } from "@/lib/api/route-helpers";

const CheckoutBody = z.object({
  plan:    z.enum(["personal", "pro", "team"] as const),
  billing: z.enum(["monthly", "annual"]).default("annual"),
});

export async function POST(req: NextRequest) {
  if (!isStripeReady() || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataOrResp = await readJsonBody(req, CheckoutBody);
  if (dataOrResp instanceof NextResponse) return dataOrResp;
  const { plan, billing } = dataOrResp;

  const priceId = STRIPE_PRICE_IDS[plan][billing];
  if (!priceId) {
    return NextResponse.json({ error: `No price configured for ${plan}/${billing}` }, { status: 503 });
  }

  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Retrieve or create Stripe customer
  let customerId = user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name:  user.name  ?? undefined,
      metadata: { cockpitUserId: userId },
    });
    customerId = customer.id;
    await updateUserBilling(userId, { stripeCustomerId: customerId });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode:        "subscription",
    customer:    customerId,
    line_items:  [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url:  `${origin}/settings?billing=canceled`,
    metadata:    { cockpitUserId: userId, plan },
    subscription_data: {
      metadata: { cockpitUserId: userId, plan },
    },
  });

  return NextResponse.json({ url: session.url });
}
