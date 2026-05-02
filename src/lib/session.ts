import { auth } from "@/auth";
import { DEFAULT_USER_ID } from "@/lib/constants";

/**
 * Returns the authenticated user's ID from the session.
 * Falls back to DEFAULT_USER_ID so existing single-user flows
 * keep working during the transition to full multi-tenancy.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  return session?.user?.id ?? DEFAULT_USER_ID;
}
