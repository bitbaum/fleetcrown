// Cloud-side "start a new project from scratch" — creates a brand new GitHub
// repo AND the matching FleetCrown project record in one round-trip. This is
// the catsitting-startup loop closer: the user has an idea but no local
// runtime (Fleet Runner not installed), and they can still get a real repo +
// FleetCrown row spun up. They clone the repo to their machine afterward.
//
// Companion to /api/project/bootstrap which does the full local-stack
// scaffold (folder + git init + agent launch) but requires the local daemon.
//
// Auth: session cookie (same as /api/projects). We pull the user's GitHub
// OAuth access_token from the accounts table — created automatically when
// they signed in with GitHub. Without it, we can't create repos on their
// behalf.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getSessionUserId } from "@/lib/session";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { createProject } from "@/db/queries/projects";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";

const Body = z.object({
  name: z.string().trim().min(1, "name is required").max(80),
  description: z.string().trim().max(300).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  /** Initialize with a README.md so the repo isn't empty. */
  init_readme: z.boolean().default(true),
});

async function getGithubToken(userId: string): Promise<string | null> {
  const row = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "github")),
    columns: { access_token: true },
  });
  return row?.access_token ?? null;
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { name, description, visibility, init_readme } = parsed.data;

  const token = await getGithubToken(userId);
  if (!token) {
    return NextResponse.json(
      {
        error: "No GitHub account linked. Sign in with GitHub or use the Connect GitHub button on /control/import.",
        hasGithub: false,
      },
      { status: 400 },
    );
  }

  // Sanitize repo name. GitHub accepts most chars but we slug for predictable URLs.
  // It also matches what `gh repo create` would produce so existing callers see the same.
  const repoName = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!repoName) {
    return NextResponse.json({ error: "Name must contain at least one alphanumeric character" }, { status: 400 });
  }

  const ghRes = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName,
      description: description ?? `Started from FleetCrown · ${name}`,
      private: visibility === "private",
      auto_init: init_readme,
    }),
  });

  if (!ghRes.ok) {
    let detail = "";
    try {
      const body = await ghRes.json();
      detail = body?.errors?.[0]?.message ?? body?.message ?? "";
    } catch {
      // ignore
    }
    // Most common cases: 422 "name already exists on this account",
    // 403 token-doesn't-have-repo-scope, 401 expired token.
    return NextResponse.json(
      { error: `GitHub API rejected the create (${ghRes.status})`, detail, status: ghRes.status },
      { status: ghRes.status === 422 ? 409 : 502 },
    );
  }

  const repo = (await ghRes.json()) as {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    ssh_url: string;
    clone_url: string;
    private: boolean;
  };

  // Now create the FleetCrown project entity. We use the original (un-slugged)
  // name as the display name; the slugged repo name lives in description.
  let projectId: string;
  let projectName: string;
  try {
    const project = await createProject(
      userId,
      {
        name,
        description: `${repo.html_url}${description ? " · " + description : ""}`,
      },
      SOURCE_FLEETCROWN_UI,
    );
    projectId = project.id;
    projectName = project.name;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // The GitHub repo IS created at this point; we just couldn't add the FC row.
    // Surface the GitHub URL so the user isn't dead in the water.
    return NextResponse.json(
      {
        ok: false,
        error: `Project record could not be created (${msg.includes("duplicate") ? "duplicate name" : "db error"}), but the GitHub repo is live:`,
        gitUrl: repo.html_url,
        cloneCmd: `git clone ${repo.ssh_url}`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    project: { id: projectId, name: projectName },
    repo: {
      name: repo.name,
      full_name: repo.full_name,
      gitUrl: repo.html_url,
      sshUrl: repo.ssh_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
    },
    cloneCmd: `git clone ${repo.ssh_url}`,
    cloneHttpsCmd: `git clone ${repo.clone_url}`,
  });
}
