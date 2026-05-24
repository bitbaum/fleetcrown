import type { users } from "@/db/schema";
import { hasValidUsername, suggestUsername } from "@/lib/onboarding";

type UserRow = typeof users.$inferSelect;

export type HealPatch = { username?: string; onboardedAt?: Date };

/**
 * Pure decision: given a user row, their active project count, and whether
 * the suggested username is available, returns the patch to apply (or null
 * if no heal needed). Extracted from healReturningUserOnboarding so the
 * branch logic is unit-testable without DB plumbing — see
 * scripts/test/onboarding-heal.ts.
 *
 * Lives in its own file (rather than inside onboarding-heal.ts) because the
 * test script must not pull in @/db at import time — that file initializes
 * the Postgres pool and fails without DATABASE_URL.
 */
export function decideHealPatch(
  user: Pick<UserRow, "name" | "email" | "username" | "onboardedAt">,
  projectCount: number,
  suggestedUsernameAvailable: boolean,
): HealPatch | null {
  const isReturning = projectCount > 0 || user.onboardedAt != null;
  if (!isReturning) return null;

  let username = user.username;
  if (!hasValidUsername(username)) {
    const suggested = suggestUsername(user.name, user.email);
    if (suggested && suggestedUsernameAvailable) {
      username = suggested;
    }
  }

  const needsUsername = !hasValidUsername(user.username) && hasValidUsername(username);
  const needsOnboarded = user.onboardedAt == null;

  if (!needsUsername && !needsOnboarded) return null;

  return {
    ...(needsUsername && username ? { username } : {}),
    ...(needsOnboarded ? { onboardedAt: new Date() } : {}),
  };
}
