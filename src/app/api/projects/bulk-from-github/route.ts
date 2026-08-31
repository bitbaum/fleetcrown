// Bulk-create projects from a list of GitHub repositories.
//
// Why this exists: a new FleetCrown user with multiple repos (the common case
// when they install FC because they're already managing 10+ projects across
// the studio stack) shouldn't have to add projects one-by-one. They sign in
// with GitHub → /api/github/repos returns their list → this endpoint takes
// the IDs they pick and creates N projects in one round-trip. Existing
// single-add path (POST /api/projects) is preserved for one-off cases.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { createProject } from "@/db/queries/projects";
import { getGithubToken } from "@/lib/github-token";
import type { GitHubRepo } from "@/app/api/github/repos/route";
import { scheduleProjectProfileReindexByEntityId } from "@/lib/rag/reindex-project-profile";
import { GITHUB_API_BASE } from "@/lib/github-api";

const BulkBody = z.object({
  repoIds: z.array(z.number().int().positive()).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = BulkBody.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid body", details: body.error.flatten() },
      { status: 400 },
    );
  }
  const { repoIds } = body.data;

  const token = await getGithubToken(userId);
  if (!token) {
    return NextResponse.json(
      { error: "No GitHub account linked", hasGithub: false },
      { status: 400 },
    );
  }

  // Re-fetch the user's repos from GitHub. We can't trust client-supplied
  // names/descriptions (would let a caller create projects with arbitrary
  // metadata); the ID is the trust anchor — we look up the canonical name
  // and description from GitHub via the user's own token.
  const res = await fetch(
    `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100&affiliation=owner`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "GitHub API error", status: res.status }, { status: 502 });
  }
  const repos = (await res.json()) as GitHubRepo[];
  const byId = new Map(repos.map((r) => [r.id, r]));

  const created: { id: string; name: string; repoId: number }[] = [];
  const skipped: { repoId: number; reason: string }[] = [];

  for (const repoId of repoIds) {
    const repo = byId.get(repoId);
    if (!repo) {
      skipped.push({ repoId, reason: "not-found" });
      continue;
    }
    try {
      const project = await createProject(
        userId,
        {
          name: repo.name,
          description: repo.description ?? undefined,
          gitUrl: repo.html_url,
        },
        SOURCE_FLEETCROWN_UI,
      );
      scheduleProjectProfileReindexByEntityId(userId, project.id);
      created.push({ id: project.id, name: project.name, repoId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // duplicate name = harmless; report as skipped, keep going.
      skipped.push({ repoId, reason: msg.includes("duplicate") ? "duplicate" : msg });
    }
  }

  return NextResponse.json({ created, skipped, total: repoIds.length });
}
