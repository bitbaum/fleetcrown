// Cloud-side "start a new project from scratch" — creates a brand new GitHub
// repo AND the matching FleetCrown project record in one round-trip. This is
// the catsitting-startup loop closer: the user has an idea but no local
// runtime (Fleet Runner not installed), and they can still get a real repo +
// FleetCrown row spun up. They clone the repo to their machine afterward.
//
// Companion to /api/project/bootstrap which does the full local-stack
// scaffold (folder + git init + agent launch) but requires the local runner.
//
// Auth: session cookie (same as /api/projects). We pull the user's GitHub
// OAuth access_token from the accounts table — created automatically when
// they signed in with GitHub. Without it, we can't create repos on their
// behalf.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/session";
import { getGithubToken } from "@/lib/github-token";
import { createProject } from "@/db/queries/projects";
import { SOURCE_FLEETCROWN_UI } from "@/lib/constants";
import { TEMPLATES, renderTemplate, type TemplateId } from "@/lib/project-templates";

// GitHub create-repo + multi-call template seed (branches/main → blobs in
// parallel → tree → commit → patch ref) can run 5-15s end-to-end under
// normal latency. Vercel's default 10s ceiling tripped a 502 mid-flight
// during dogfood 2026-06-05 — repo was never created, no error surfaced.
// Match ai-brief's pattern (which faces similar third-party-API tail
// latency). 60s is a comfortable margin without inviting hung functions.
export const maxDuration = 60;

const Body = z.object({
  name: z.string().trim().min(1, "name is required").max(80),
  description: z.string().trim().max(300).optional(),
  visibility: z.enum(["private", "public"]).default("private"),
  /** Initialize with a README.md so the repo isn't empty. */
  init_readme: z.boolean().default(true),
  /** Starter template to seed into the repo. "bare" leaves it as just a README. */
  template: z
    .enum(["bare", "nextjs-tailwind", "python-fastapi", "hono-cloudflare", "html-tailwind"])
    .default("bare"),
});

/**
 * Commit a set of template files to the new repo in one round-trip via the
 * Git Trees API. Returns true on success, false on failure (the repo still
 * exists; only the template seeding failed, which is non-fatal).
 *
 * Flow: get the auto-init README commit → create blobs for each template
 * file → create a new tree on top of the README tree → create a commit →
 * fast-forward the main branch ref. Sequential API calls but the blob
 * creation is fan-out parallel.
 */
async function seedTemplate(
  token: string,
  ownerLogin: string,
  repoName: string,
  templateId: TemplateId,
  values: { name: string; description: string },
): Promise<boolean> {
  const template = TEMPLATES[templateId];
  if (!template || Object.keys(template.files).length === 0) return true;

  const gh = (path: string, init?: RequestInit) =>
    fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  const repoPath = `/repos/${ownerLogin}/${repoName}`;

  // 1. Read main branch's latest commit + tree.
  const branchRes = await gh(`${repoPath}/branches/main`);
  if (!branchRes.ok) return false;
  const branchData = (await branchRes.json()) as {
    commit: { sha: string; commit: { tree: { sha: string } } };
  };
  const baseCommitSha = branchData.commit.sha;
  const baseTreeSha = branchData.commit.commit.tree.sha;

  // 2. Create blobs in parallel — render placeholders first.
  const fileEntries = Object.entries(template.files);
  const blobs = await Promise.all(
    fileEntries.map(async ([path, body]) => {
      const content = renderTemplate(body, values);
      const blobRes = await gh(`${repoPath}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content, encoding: "utf-8" }),
      });
      if (!blobRes.ok) throw new Error(`blob create failed for ${path}`);
      const { sha } = (await blobRes.json()) as { sha: string };
      return { path, mode: "100644" as const, type: "blob" as const, sha };
    }),
  ).catch(() => null);
  if (!blobs) return false;

  // 3. Create a tree on top of the existing one (so README from auto_init stays).
  const treeRes = await gh(`${repoPath}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
  });
  if (!treeRes.ok) return false;
  const { sha: newTreeSha } = (await treeRes.json()) as { sha: string };

  // 4. Create the commit.
  const commitRes = await gh(`${repoPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Add ${template.label} starter (seeded by FleetCrown)`,
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  });
  if (!commitRes.ok) return false;
  const { sha: newCommitSha } = (await commitRes.json()) as { sha: string };

  // 5. Move the main branch ref forward.
  const refRes = await gh(`${repoPath}/git/refs/heads/main`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommitSha }),
  });
  return refRes.ok;
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
  const { name, description, visibility, init_readme, template } = parsed.data;

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
    owner: { login: string };
  };

  // If the user picked a non-bare template, seed its files into the repo
  // before we return. Failure here is non-fatal — the repo still exists, the
  // user can clone the bare version and add files manually.
  let templateSeeded = true;
  if (template !== "bare") {
    templateSeeded = await seedTemplate(
      token,
      repo.owner.login,
      repo.name,
      template,
      { name, description: description ?? `Started from FleetCrown · ${name}` },
    );
  }

  // Now create the FleetCrown project entity. We use the original (un-slugged)
  // name as the display name; the slugged repo name lives in description.
  let projectId: string;
  let projectName: string;
  try {
    const project = await createProject(
      userId,
      {
        name,
        description: description ?? undefined,
        gitUrl: repo.html_url,
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
    template,
    templateSeeded,
    cloneCmd: `git clone ${repo.ssh_url}`,
    cloneHttpsCmd: `git clone ${repo.clone_url}`,
  });
}
