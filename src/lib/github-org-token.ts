/**
 * Which GitHub token writes to the fleet's organisation.
 *
 * Repositories are created in the org, never on a personal account. The
 * person's OAuth token cannot always do that: an org with OAuth-app access
 * restrictions refuses third-party apps until an owner approves them, and
 * that refusal (HTTP 403, "OAuth App access restrictions") is what stopped
 * every kickoff at "Creating the repository" on 2026-09-11.
 *
 * So org writes use a server-held token when one is configured
 * (`GITHUB_ORG_TOKEN`: an org admin's token with `repo` + `workflow` — the same
 * identity the box's site factory already creates repos with), and fall back
 * to the person's token otherwise. Identity-scoped reads (which repos does
 * this person have, who are they) keep using the person's token.
 */
export function getOrgGithubToken(): string | null {
  const token = process.env.GITHUB_ORG_TOKEN?.trim();
  return token ? token : null;
}

/** Pure: the token an org-scoped write should use. Exported for the test. */
export function pickRepoWriteToken(
  orgToken: string | null,
  userToken: string | null,
): { token: string; source: "org" | "user" } | null {
  if (orgToken) return { token: orgToken, source: "org" };
  if (userToken) return { token: userToken, source: "user" };
  return null;
}

/**
 * The token for creating, seeding, wiring or deleting a repo in the org.
 * Null when neither a server token nor a linked GitHub account exists.
 */
export async function getRepoWriteToken(
  userId: string,
): Promise<{ token: string; source: "org" | "user" } | null> {
  const { getGithubToken } = await import("@/lib/github-token");
  return pickRepoWriteToken(getOrgGithubToken(), await getGithubToken(userId));
}
