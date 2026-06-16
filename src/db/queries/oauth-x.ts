import { db } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Find (or create) the FleetCrown user behind an X account, keyed by the X
 * numeric user id. The link lives in the `accounts` table under
 * provider="twitter" — the same providerAccountId the OAuth2 flow used — so a
 * user who logged in via X before keeps the same account on the 1.0a path.
 */
export async function findOrCreateTwitterUser(
  xUserId: string,
  screenName: string,
): Promise<{ id: string; name: string | null; email: string | null; username: string | null }> {
  const [link] = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, "twitter"), eq(accounts.providerAccountId, xUserId)))
    .limit(1);

  if (link) {
    const existing = await db.query.users.findFirst({ where: eq(users.id, link.userId) });
    if (existing) return existing;
  }

  const [user] = await db.insert(users).values({ name: screenName }).returning();
  await db
    .insert(accounts)
    .values({ userId: user.id, type: "oauth", provider: "twitter", providerAccountId: xUserId })
    .onConflictDoNothing();
  return user;
}
