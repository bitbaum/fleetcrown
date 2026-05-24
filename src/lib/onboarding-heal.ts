import { countActiveProjects } from "@/db/queries/user-projects";
import { getUserByUsername, updateUser } from "@/db/queries/users";
import type { users } from "@/db/schema";
import {
  hasValidUsername,
  isOnboardingComplete,
  suggestUsername,
} from "@/lib/onboarding";

type UserRow = typeof users.$inferSelect;

/**
 * Returning / migrated users: skip onboarding when they already have app data.
 * Sets username + onboarded_at when missing so JWT + middleware can unblock.
 *
 * Never throws. Heal is an optimization layer on the sign-in path — a
 * transient DB hiccup or a unique-constraint race on the suggested username
 * must not turn into AccessDenied or a 500 from /api/onboarding. Callers
 * (auth.ts jwt callback, /api/onboarding GET/POST) can rely on this always
 * returning a valid UserRow; the un-healed user falls through the normal
 * onboarding flow instead of being locked out.
 */
export async function healReturningUserOnboarding(user: UserRow): Promise<UserRow> {
  try {
    const projectCount = await countActiveProjects(user.id);
    const isReturning = projectCount > 0 || user.onboardedAt != null;
    if (!isReturning) return user;

    let username = user.username;
    if (!hasValidUsername(username)) {
      const suggested = suggestUsername(user.name, user.email);
      if (suggested) {
        const taken = await getUserByUsername(suggested);
        if (!taken || taken.id === user.id) username = suggested;
      }
    }

    const needsUsername = !hasValidUsername(user.username) && hasValidUsername(username);
    const needsOnboarded = user.onboardedAt == null;

    if (!needsUsername && !needsOnboarded) return user;

    const updated = await updateUser(user.id, {
      ...(needsUsername && username ? { username } : {}),
      ...(needsOnboarded ? { onboardedAt: new Date() } : {}),
    });
    return updated ?? user;
  } catch (e) {
    // Stderr (not logDebug) — the DB may be the very thing that's failing,
    // and a logDebug insert would just compound the error path. Vercel
    // captures stderr, so the signal survives.
    console.error("[onboarding-heal] heal failed; returning un-healed user:", (e as Error)?.message);
    return user;
  }
}

export function onboardingCompleteFlag(user: {
  username: string | null | undefined;
  onboardedAt: Date | null | undefined;
}): boolean {
  return isOnboardingComplete(user);
}
