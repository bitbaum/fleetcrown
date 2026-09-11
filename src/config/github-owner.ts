/**
 * Where FleetCrown creates repositories: the organisation, never a person.
 *
 * On 2026-08-27 the whole fleet (41 repos) moved from the personal `catomean`
 * account into the `bitbaum` org, and the changelog said "the org is the
 * stable home going forward". Nothing enforced it for NEW repos: the hosted
 * cold-start path called `POST /user/repos` (= whoever is signed in) and the
 * bootstrap route preferred the signed-in GitHub user over the org, so five
 * sites created on 2026-09-10/11 landed under `catomean` again and had to be
 * transferred by hand. This constant is the one place the owner is decided;
 * scripts/test/repos-are-created-in-the-org.ts fails on any creation path
 * that does not go through it.
 */
export const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER?.trim() || "bitbaum";

/** The URL a repo of ours has, given its slug. */
export function repoUrlFor(slug: string, owner: string = GITHUB_REPO_OWNER): string {
  return `https://github.com/${owner}/${slug}`;
}
