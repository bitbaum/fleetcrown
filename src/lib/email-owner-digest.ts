import { getDefaultUser } from "@/db/queries/users";
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "@/db/queries/notification-preferences";

/** The operator who used to get a canary ping gets the real weekly digest. */
export async function ensureOwnerWeeklyDigest(): Promise<boolean> {
  const owner = await getDefaultUser();
  if (!owner) return false;
  const prefs = await getNotificationPreferences(owner.id);
  if (prefs && prefs.emailDigestCadence !== "none") return false;
  await upsertNotificationPreferences(owner.id, { emailDigestCadence: "weekly" });
  return true;
}
