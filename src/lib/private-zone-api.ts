import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { guardPrivateZoneApi } from "@/lib/private-zone";

type Ok = { userId: string };

/**
 * Authenticated session + private-zone PIN (when configured).
 * Use at the top of people / money / habits / events API handlers.
 */
export async function requirePrivateApiAccess(): Promise<Ok | NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await guardPrivateZoneApi(userId);
  if (denied) return denied;
  return { userId };
}
