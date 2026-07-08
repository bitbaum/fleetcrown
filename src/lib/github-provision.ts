// Create a GitHub repo (optionally seeded with a starter template) via the
// GitHub API using the user's OAuth token. Server-side — no local runner needed.
// Shared by /api/projects/create-with-github (new project) and
// /api/projects/[id]/provision (link a repo to an existing project).

import { TEMPLATES, renderTemplate, type TemplateId } from "@/lib/project-templates";

export type ProvisionedRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  private: boolean;
  owner: { login: string };
};

/** GitHub-slug a display name the same way `gh repo create` would. */
export function repoSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Seed a template's files into a freshly-created repo in one commit via the Git
 * Trees API. Non-fatal on failure (the repo still exists, just bare). Flow:
 * read main's tip → create blobs (parallel) → tree on top → commit → move ref.
 */
export async function seedTemplate(
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

  const branchRes = await gh(`${repoPath}/branches/main`);
  if (!branchRes.ok) return false;
  const branchData = (await branchRes.json()) as { commit: { sha: string; commit: { tree: { sha: string } } } };
  const baseCommitSha = branchData.commit.sha;
  const baseTreeSha = branchData.commit.commit.tree.sha;

  const blobs = await Promise.all(
    Object.entries(template.files).map(async ([path, body]) => {
      const content = renderTemplate(body, values);
      const blobRes = await gh(`${repoPath}/git/blobs`, { method: "POST", body: JSON.stringify({ content, encoding: "utf-8" }) });
      if (!blobRes.ok) throw new Error(`blob create failed for ${path}`);
      const { sha } = (await blobRes.json()) as { sha: string };
      return { path, mode: "100644" as const, type: "blob" as const, sha };
    }),
  ).catch(() => null);
  if (!blobs) return false;

  const treeRes = await gh(`${repoPath}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }) });
  if (!treeRes.ok) return false;
  const { sha: newTreeSha } = (await treeRes.json()) as { sha: string };

  const commitRes = await gh(`${repoPath}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: `Add ${template.label} starter (seeded by FleetCrown)`, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!commitRes.ok) return false;
  const { sha: newCommitSha } = (await commitRes.json()) as { sha: string };

  const refRes = await gh(`${repoPath}/git/refs/heads/main`, { method: "PATCH", body: JSON.stringify({ sha: newCommitSha }) });
  return refRes.ok;
}

export type ProvisionResult =
  | { ok: true; repo: ProvisionedRepo; templateSeeded: boolean }
  | { ok: false; status: number; error: string; detail?: string };

/** Create a repo on the user's account and seed the chosen template. */
export async function provisionGithubRepo(
  token: string,
  opts: { name: string; description?: string; visibility?: "private" | "public"; initReadme?: boolean; template?: TemplateId },
): Promise<ProvisionResult> {
  const name = repoSlug(opts.name);
  if (!name) return { ok: false, status: 400, error: "Name must contain at least one alphanumeric character" };

  const description = opts.description ?? `Started from FleetCrown · ${opts.name}`;
  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, private: (opts.visibility ?? "private") === "private", auto_init: opts.initReadme ?? true }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.errors?.[0]?.message ?? body?.message ?? "";
    } catch { /* ignore */ }
    // 422 = name already exists on the account.
    return { ok: false, status: res.status, error: `GitHub rejected the create (${res.status})`, detail };
  }

  const repo = (await res.json()) as ProvisionedRepo;

  let templateSeeded = true;
  const template = opts.template ?? "bare";
  if (template !== "bare") {
    templateSeeded = await seedTemplate(token, repo.owner.login, repo.name, template, { name: opts.name, description });
  }

  return { ok: true, repo, templateSeeded };
}
