import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getUserByStripeCustomerId, updateUserBilling } from "@/db/queries/users";
import type { Plan, PlanStatus } from "@/db/schema/users";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const secret    = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const customerId = session.customer as string;
      const plan       = (session.metadata?.plan ?? "personal") as Plan;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        await updateUserBilling(user.id, {
          plan,
          planStatus:           "active",
          stripeSubscriptionId: session.subscription as string,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub      = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (!user) break;

      const rawStatus = sub.status;
      const planStatus: PlanStatus | null =
        rawStatus === "active"    ? "active"   :
        rawStatus === "past_due"  ? "past_due" :
        rawStatus === "canceled"  ? "canceled" :
        null;

      const plan = (sub.metadata?.plan ?? user.plan) as Plan;
      await updateUserBilling(user.id, { plan, planStatus, stripeSubscriptionId: sub.id });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const user = await getUserByStripeCustomerId(sub.customer as string);
      if (user) {
        await updateUserBilling(user.id, {
          plan:                 "free",
          planStatus:           "canceled",
          stripeSubscriptionId: null,
        });
      }
      break;
    }

    default:
      // Unhandled event types are silently ignored
      break;
  }

  return NextResponse.json({ received: true });
}
