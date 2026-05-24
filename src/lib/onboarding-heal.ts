import { countActiveProjects } from "@/db/queries/user-projects";
import { getUserByUsername, updateUser } from "@/db/queries/users";
import type { users } from "@/db/schema";
import {
  hasValidUsername,
  isOnboardingComplete,
  suggestUsername,
} from "@/lib/onboarding";
import { decideHealPatch } from "@/lib/onboarding-heal-decision";

type UserRow = typeof users.$inferSelect;

export { decideHealPatch } from "@/lib/onboarding-heal-decision";
export type { HealPatch } from "@/lib/onboarding-heal-decision";

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

    let suggestedUsernameAvailable = false;
    if (!hasValidUsername(user.username)) {
      const suggested = suggestUsername(user.name, user.email);
      if (suggested) {
        const taken = await getUserByUsername(suggested);
        suggestedUsernameAvailable = !taken || taken.id === user.id;
      }
    }

    const patch = decideHealPatch(user, projectCount, suggestedUsernameAvailable);
    if (!patch) return user;

    const updated = await updateUser(user.id, patch);
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
