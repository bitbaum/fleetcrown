// GET  — read the current user's notification preferences (defaults to "none"
//        when no row exists).
// PATCH — opt into / out of periodic digest emails.

import { NextRequest, NextResponse } from "next/server";
import { getApiUserId } from "@/lib/session";
import { readJsonBody, z } from "@/lib/api/route-helpers";
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "@/db/queries/notification-preferences";
import { DIGEST_CADENCES } from "@/db/schema/notification-preferences";

const PatchBody = z.object({
  emailDigestCadence: z.enum(DIGEST_CADENCES),
});

export async function GET() {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const row = await getNotificationPreferences(userId);
  return NextResponse.json({
    emailDigestCadence: row?.emailDigestCadence ?? "none",
    lastDigestSentAt: row?.lastDigestSentAt?.toISOString() ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await getApiUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = await readJsonBody(req, PatchBody);
  if (parsed instanceof NextResponse) return parsed;
  await upsertNotificationPreferences(userId, parsed);
  return NextResponse.json({ ok: true, emailDigestCadence: parsed.emailDigestCadence });
}
