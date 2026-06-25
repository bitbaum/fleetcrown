import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSessionUserId } from "@/lib/session";
import { guardPrivateZoneApi } from "@/lib/private-zone";
import { validateAgentToken } from "@/db/queries/agent-tokens";

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

/**
 * Like requirePrivateApiAccess, but ALSO accepts a `ck_*` agent bearer token
 * (used by Loki's `loki_propose` plugin). A valid per-user token IS George's own
 * credential, so it bypasses the interactive PIN (an agent can't unlock the
 * private zone). Proposing only creates a DRAFT — nothing executes without
 * George's explicit approval (IRON RULE), so the action queue stays the gate.
 */
export async function requirePrivateApiAccessWithBearer(): Promise<Ok | NextResponse> {
  const authHeader = (await headers()).get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7);
    if (bearer.startsWith("ck_")) {
      const result = await validateAgentToken(bearer);
      if (result) return { userId: result.userId };
    }
  }
  return requirePrivateApiAccess();
}
