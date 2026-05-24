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
 */
export async function healReturningUserOnboarding(user: UserRow): Promise<UserRow> {
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
}

export function onboardingCompleteFlag(user: {
  username: string | null | undefined;
  onboardedAt: Date | null | undefined;
}): boolean {
  return isOnboardingComplete(user);
}
