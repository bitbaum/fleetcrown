import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { DEFAULT_USER_NAME } from "@/lib/constants";
import { validateAgentToken } from "@/db/queries/agent-tokens";

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
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}

export async function getCurrentUserName(): Promise<string> {
  const session = await auth();
  return session?.user?.name ?? DEFAULT_USER_NAME;
}

/**
 * For API routes that must also accept bearer tokens (daemon + CLI agent).
 * Checks cookie session first, then COCKPIT_DAEMON_TOKEN env var, then ck_* DB tokens.
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

  // Legacy env-var token → owner user.
  const envToken = process.env.COCKPIT_DAEMON_TOKEN;
  if (envToken && bearer === envToken) {
    const { getDefaultUser } = await import("@/db/queries/users");
    const user = await getDefaultUser();
    return user?.id ?? null;
  }

  // DB agent token (ck_*).
  if (bearer.startsWith("ck_")) {
    const result = await validateAgentToken(bearer);
    return result?.userId ?? null;
  }

  return null;
}

/**
 * @deprecated Use requirePageUserId() in server components/actions,
 * or getSessionUserId() + 401 check in API routes.
 */
export async function getCurrentUserId(): Promise<string> {
  return requirePageUserId();
}
