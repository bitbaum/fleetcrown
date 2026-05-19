import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { DEFAULT_USER_NAME } from "@/lib/constants";
import { ROUTES } from "@/config/auth";
import { validateAgentToken } from "@/db/queries/agent-tokens";
import { envAlias, envAliasBool } from "@/lib/brand-env";

/**
 * Returns the authenticated user's ID, or null if there is no session.
 * Use in API routes (pair with an explicit 401 check).
 * Middleware already blocks browser clients without a session — this is defense-in-depth.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * Returns the authenticated user's ID.
 * Redirects to /sign-in if there is no session.
 * Use in server components and server actions.
 */
export async function requirePageUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect(ROUTES.SIGN_IN);
  return session.user.id;
}

export async function getCurrentUserName(): Promise<string> {
  const session = await auth();
  return session?.user?.name ?? DEFAULT_USER_NAME;
}

let warnedDeprecatedDaemonToken = false;

/**
 * For API routes that must also accept bearer tokens (daemon + CLI agent).
 * Prefers ck_* DB-backed agent tokens (per-user, revocable). The legacy
 * COCKPIT_DAEMON_TOKEN env-var path is only honored when explicitly opted in
 * via COCKPIT_ALLOW_LEGACY_DAEMON_TOKEN=1 — and even then it always maps to
 * the single "default" user, so it must never be used in a multi-tenant
 * deployment.
 */
export async function getApiUserId(): Promise<string | null> {
  // Cookie-based session (web UI).
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // Bearer token (daemon / CLI agent).
  const headersList = await headers();
  const authHeader = headersList.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const bearer = authHeader.slice(7);

  // DB agent token (ck_*) — preferred path. Per-user, per-device, revocable.
  if (bearer.startsWith("ck_")) {
    const result = await validateAgentToken(bearer);
    return result?.userId ?? null;
  }

  // Legacy env-var token → "default" user. Opt-in only; not multi-tenant safe.
  const envToken = envAlias("DAEMON_TOKEN");
  const legacyAllowed = envAliasBool("ALLOW_LEGACY_DAEMON_TOKEN");
  if (envToken && legacyAllowed && bearer === envToken) {
    if (!warnedDeprecatedDaemonToken) {
      warnedDeprecatedDaemonToken = true;
      console.warn(
        "[session] DAEMON_TOKEN bearer is deprecated and unsafe in multi-tenant deployments. " +
        "Mint a ck_* agent token from /settings and use it instead.",
      );
    }
    const { getDefaultUser } = await import("@/db/queries/users");
    const user = await getDefaultUser();
    return user?.id ?? null;
  }

  return null;
}
