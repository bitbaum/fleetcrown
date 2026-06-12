import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

/**
 * OAuth access token of the user's linked GitHub account, or null when no
 * GitHub account is linked. Extracted after the same query appeared in three
 * routes (github/repos, bulk-from-github, create-with-github) — rule of three.
 */
export async function getGithubToken(userId: string): Promise<string | null> {
  const row = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "github")),
    columns: { access_token: true },
  });
  return row?.access_token ?? null;
}
