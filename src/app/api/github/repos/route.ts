import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getGithubToken } from "@/lib/github-token";

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  private: boolean;
  fork: boolean;
};

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getGithubToken(userId);
  if (!token) {
    // User signed up with email/password — no GitHub token.
    return NextResponse.json({ repos: [], hasGithub: false });
  }

  // Time-box + guard the upstream call: a slow/down/malformed GitHub response
  // must degrade to a clean 502, never hang the request or throw an unhandled
  // 500 with a stack. This endpoint feeds the onboarding repo picker, so a
  // GitHub hiccup would otherwise stall a new user's first project.
  try {
    const res = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(12_000),
      },
    );

    if (!res.ok) {
      return NextResponse.json({ error: "GitHub API error", status: res.status }, { status: 502 });
    }

    const all = (await res.json()) as GitHubRepo[];
    // Return only non-fork public repos, sorted by most recently updated.
    const repos = all.filter((r) => !r.fork).slice(0, 30);
    return NextResponse.json({ repos, hasGithub: true });
  } catch (err) {
    console.error("[github/repos] upstream failed:", (err as Error).message);
    return NextResponse.json({ error: "GitHub is unreachable right now", status: 502 }, { status: 502 });
  }
}
