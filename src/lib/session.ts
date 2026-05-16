import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DEFAULT_USER_NAME } from "@/lib/constants";

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
 * @deprecated Use requirePageUserId() in server components/actions,
 * or getSessionUserId() + 401 check in API routes.
 */
export async function getCurrentUserId(): Promise<string> {
  return requirePageUserId();
}
