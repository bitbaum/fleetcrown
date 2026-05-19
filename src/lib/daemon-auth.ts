import { NextRequest } from "next/server";
import { getDefaultUser } from "@/db/queries/users";
import { validateAgentToken } from "@/db/queries/agent-tokens";

function extractBearer(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

function legacyDaemonTokenEnabled(): boolean {
  return Boolean(
    process.env.COCKPIT_DAEMON_TOKEN &&
    process.env.COCKPIT_ALLOW_LEGACY_DAEMON_TOKEN === "1",
  );
}

/**
 * Returns true if the request carries a valid COCKPIT_DAEMON_TOKEN bearer credential.
 * @deprecated Use ck_* agent tokens. This path only resolves when
 * COCKPIT_ALLOW_LEGACY_DAEMON_TOKEN=1 is set — it always maps to the "default"
 * user and is not multi-tenant safe.
 */
export function isDaemonRequest(req: NextRequest): boolean {
  if (!legacyDaemonTokenEnabled()) return false;
  return extractBearer(req) === process.env.COCKPIT_DAEMON_TOKEN;
}

/** Looks up the default user's ID for daemon-authenticated requests. */
export async function getDaemonUserId(): Promise<string | null> {
  const user = await getDefaultUser();
  return user?.id ?? null;
}

/**
 * Resolves userId for any bearer-authenticated request.
 * Prefers ck_* agent tokens; falls back to the legacy env token only when
 * explicitly opted in (see legacyDaemonTokenEnabled).
 */
export async function getBearerUserId(req: NextRequest): Promise<string | null> {
  const bearer = extractBearer(req);
  if (!bearer) return null;

  if (bearer.startsWith("ck_")) {
    const result = await validateAgentToken(bearer);
    return result?.userId ?? null;
  }

  if (legacyDaemonTokenEnabled() && bearer === process.env.COCKPIT_DAEMON_TOKEN) {
    return getDaemonUserId();
  }

  return null;
}
