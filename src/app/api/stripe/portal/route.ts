import { NextRequest, NextResponse } from "next/server";
import { stripe, isStripeReady } from "@/lib/stripe";
import { getCurrentUserId } from "@/lib/session";
import { getUserById } from "@/db/queries/users";

export async function GET(req: NextRequest) {
  if (!isStripeReady() || !stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserById(userId);
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 });
  }

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer:   user.stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return NextResponse.redirect(session.url);
}
