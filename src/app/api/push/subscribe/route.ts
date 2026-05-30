import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import {
  upsertSubscription,
  removeSubscriptionForUser,
} from "@/db/queries/push-subscriptions";

export const dynamic = "force-dynamic";

const SubscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth:   z.string().min(1),
    }),
  }),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url(),
});

/**
 * POST — store the browser-issued PushSubscription for the current user.
 * Idempotent on `endpoint`; resubscribing from the same device refreshes
 * the metadata.
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = SubscribeBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const ua = req.headers.get("user-agent") ?? null;
  await upsertSubscription(userId, parsed.data.subscription, ua);
  return NextResponse.json({ ok: true });
}

/**
 * DELETE — remove a subscription by endpoint. Scoped to the calling user so
 * one user can't drop another user's row. Used by the client when permission
 * is revoked or the PWA is uninstalled.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = UnsubscribeBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
  }

  await removeSubscriptionForUser(userId, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
