/**
 * Recent commits for a project's GitHub repo — the evidence layer that keeps
 * the profile truthful when work lands outside FleetCrown-dispatched runs
 * (observed: a project showed "Idle · last active 1mo ago" while 17 commits
 * landed in two days). Uses the owner's linked GitHub OAuth token, same as
 * github-provision. Server-side only; failures degrade to null, never break
 * the page.
 */

import { GITHUB_API_BASE } from "@/lib/github-api";

export type RepoCommit = {
  sha: string;
  message: string;
  author: string | null;
  /** Commit time (committer date) in epoch ms. */
  atMs: number;
};

const GITHUB_HOST_RE = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/;

export function parseGithubRepo(gitUrl: string): { owner: string; repo: string } | null {
  const match = gitUrl.match(GITHUB_HOST_RE);
  return match ? { owner: match[1], repo: match[2] } : null;
}

export async function fetchRecentGithubCommits(
  gitUrl: string,
  token: string,
  limit = 10,
): Promise<RepoCommit[] | null> {
  const parsed = parseGithubRepo(gitUrl);
  if (!parsed) return null;
  try {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/commits?per_page=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        // Commits are evidence, not live state — a short cache keeps profile
        // loads off the GitHub rate limit without going stale.
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      sha?: string;
      commit?: { message?: string; committer?: { date?: string }; author?: { name?: string; date?: string } };
    }>;
    if (!Array.isArray(rows)) return null;
    return rows.flatMap((row) => {
      const dateStr = row.commit?.committer?.date ?? row.commit?.author?.date;
      const atMs = dateStr ? Date.parse(dateStr) : NaN;
      if (!row.sha || !Number.isFinite(atMs)) return [];
      return [{
        sha: row.sha.slice(0, 7),
        message: (row.commit?.message ?? "").split("\n")[0].slice(0, 120),
        author: row.commit?.author?.name ?? null,
        atMs,
      }];
    });
  } catch {
    return null;
  }
}
