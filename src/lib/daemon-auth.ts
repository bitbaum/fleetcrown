import { NextRequest } from "next/server";
import { getDefaultUser } from "@/db/queries/users";
import { validateAgentToken } from "@/db/queries/agent-tokens";

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

/** Returns true if the request carries a valid COCKPIT_DAEMON_TOKEN bearer credential. */
export function isDaemonRequest(req: NextRequest): boolean {
  const token = process.env.COCKPIT_DAEMON_TOKEN;
  if (!token) return false;
  return extractBearer(req) === token;
}

/** Looks up the default user's ID for daemon-authenticated requests. */
export async function getDaemonUserId(): Promise<string | null> {
  const user = await getDefaultUser();
  return user?.id ?? null;
}

/**
 * Resolves userId for any bearer-authenticated request.
 * Checks COCKPIT_DAEMON_TOKEN first (legacy local), then DB agent tokens (ck_*).
 */
export async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const bearer = extractBearer(req);
  if (!bearer) return null;

  const envToken = process.env.COCKPIT_DAEMON_TOKEN;
  if (envToken && bearer === envToken) return getDaemonUserId();

  if (bearer.startsWith("ck_")) {
    const result = await validateAgentToken(bearer);
    return result?.userId ?? null;
  }

  return null;
}
