// Create a GitHub repo (optionally seeded with a starter template) via the
// GitHub API using the user's OAuth token. Server-side — no local runner needed.
// Shared by /api/projects/create-with-github (new project) and
// /api/projects/[id]/provision (link a repo to an existing project).

import { TEMPLATES, renderTemplate, type TemplateId } from "@/lib/project-templates";
import { GITHUB_API_BASE } from "@/lib/github-api";
import { GITHUB_REPO_OWNER } from "@/config/github-owner";
import { HTTP_TIMEOUT_SHORT_MS, HTTP_TIMEOUT_MS } from "@/lib/constants/time";

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

const GITHUB_REPO_RE = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i;

/** GitHub-slug a display name the same way `gh repo create` would. */
export function repoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseGithubRepoUrl(gitUrl: string): { owner: string; repo: string } | null {
  const match = GITHUB_REPO_RE.exec(gitUrl.trim());
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/i, "") };
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
  feedback?: { token: string; appUrl: string },
): Promise<boolean> {
  const template = TEMPLATES[templateId];
  if (!template || Object.keys(template.files).length === 0) return true;

  const gh = (path: string, init?: RequestInit) =>
    fetch(`${GITHUB_API_BASE}${path}`, {
      ...init,
      // Each step is a small metadata call — a hung one would eat the route's
      // whole maxDuration budget. Time out fast; the catch below makes it
      // non-fatal (repo stays bare).
      signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

  const repoPath = `/repos/${ownerLogin}/${repoName}`;

  try {
    const branchRes = await gh(`${repoPath}/branches/main`);
    if (!branchRes.ok) return false;
    const branchData = (await branchRes.json()) as {
      commit: { sha: string; commit: { tree: { sha: string } } };
    };
    const baseCommitSha = branchData.commit.sha;
    const baseTreeSha = branchData.commit.commit.tree.sha;

    const blobs = await Promise.all(
      Object.entries(template.files).map(async ([path, body]) => {
        let content = renderTemplate(body, values);
        if (path === "src/app/layout.tsx" && feedback) {
          content =
            'import Script from "next/script";\n' +
            content.replace(
              "{children}</body>",
              `{children}<Script src={${JSON.stringify(feedback.appUrl.replace(/\/$/, "") + "/widget.js")}} data-fc-project={${JSON.stringify(feedback.token)}} strategy="afterInteractive" /></body>`,
            );
        }
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

    const treeRes = await gh(`${repoPath}/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
    });
    if (!treeRes.ok) return false;
    const { sha: newTreeSha } = (await treeRes.json()) as { sha: string };

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

    const refRes = await gh(`${repoPath}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommitSha }),
    });
    return refRes.ok;
  } catch {
    // Timeout or network failure mid-flow — non-fatal per contract above.
    return false;
  }
}

/**
 * Whether main already carries the starter's entry file. Seeding is non-fatal
 * by contract, so a provision can succeed with a bare repo; the retry path
 * uses this to re-seed that repo instead of refusing with "already linked".
 * Unknown (network/auth) reads as seeded — never re-seed on a guess.
 */
export async function repoHasStarterFiles(
  token: string,
  ownerLogin: string,
  repoName: string,
  templateId: TemplateId,
): Promise<boolean> {
  const files = Object.keys(TEMPLATES[templateId]?.files ?? {});
  const marker = files.includes("package.json") ? "package.json" : files[0];
  if (!marker) return true;
  try {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${ownerLogin}/${repoName}/contents/${encodeURIComponent(marker)}`,
      {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    return res.status !== 404;
  } catch {
    return true;
  }
}

export type ProvisionResult =
  | { ok: true; repo: ProvisionedRepo; templateSeeded: boolean }
  | { ok: false; status: number; error: string; detail?: string };

/**
 * The message a person can act on when the org refuses the create. GitHub
 * answers 404 (not 403) when an OAuth token has no access to an org, so the
 * two are treated alike.
 */
export function orgCreateRefusedMessage(owner: string, status: number, detail: string): string {
  return (
    `GitHub would not create the repository in the ${owner} organisation (HTTP ${status}${detail ? `: ${detail}` : ""}). ` +
    `Repositories are created there, never on a personal account. Either set GITHUB_ORG_TOKEN on the server ` +
    `(an org admin's token with repo + workflow scope), or approve FleetCrown for the org at ` +
    `https://github.com/organizations/${owner}/settings/oauth_application_policy.`
  );
}

/**
 * Create a repo in the fleet's organisation and seed the chosen template.
 *
 * ORG, NEVER THE PERSON. This used to call `POST /user/repos`, which creates
 * under whoever is signed in; five sites created on 2026-09-10/11 landed on a
 * personal account and had to be transferred by hand. There is deliberately
 * no fallback to the personal account: a repo in the wrong place is a defect
 * that costs more than a failed create with a clear message.
 */
export async function provisionGithubRepo(
  token: string,
  opts: {
    name: string;
    description?: string;
    visibility?: "private" | "public";
    initReadme?: boolean;
    template?: TemplateId;
    feedback?: { token: string; appUrl: string };
  },
): Promise<ProvisionResult> {
  const name = repoSlug(opts.name);
  if (!name)
    return {
      ok: false,
      status: 400,
      error: "Name must contain at least one alphanumeric character",
    };

  const description = opts.description ?? `Started from FleetCrown · ${opts.name}`;
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}/orgs/${GITHUB_REPO_OWNER}/repos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        private: (opts.visibility ?? "private") === "private",
        auto_init: opts.initReadme ?? true,
      }),
      // Repo creation can be slow but must not hang the route forever.
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "GitHub create timed out or was unreachable" };
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.errors?.[0]?.message ?? body?.message ?? "";
    } catch {
      /* ignore */
    }
    // 403/404 = the token cannot create in the org (not approved for it, or
    // not a member). 422 = the name already exists in the org.
    if (res.status === 403 || res.status === 404) {
      return {
        ok: false,
        status: res.status,
        error: orgCreateRefusedMessage(GITHUB_REPO_OWNER, res.status, detail),
        detail,
      };
    }
    return {
      ok: false,
      status: res.status,
      error: `GitHub rejected the create in ${GITHUB_REPO_OWNER} (${res.status})`,
      detail,
    };
  }

  const repo = (await res.json()) as ProvisionedRepo;

  let templateSeeded = true;
  const template = opts.template ?? "bare";
  if (template !== "bare") {
    templateSeeded = await seedTemplate(
      token,
      repo.owner.login,
      repo.name,
      template,
      {
        name: opts.name,
        description,
      },
      opts.feedback,
    );
  }

  return { ok: true, repo, templateSeeded };
}

export type DeprovisionResult =
  { ok: true } | { ok: false; status: number; error: string; detail?: string };

/**
 * Change a repository's visibility after the fact.
 *
 * Visibility was settable only at creation, and `new-site.sh` creates public
 * repositories — so "I want this not to be public" had no answer for the code,
 * only for the site. One PATCH; GitHub allows it in both directions, and the
 * caller decides which.
 */
export async function setGithubRepoVisibility(
  token: string,
  gitUrl: string,
  visibility: "private" | "public",
): Promise<DeprovisionResult> {
  const parsed = parseGithubRepoUrl(gitUrl);
  if (!parsed) {
    return { ok: false, status: 400, error: "Linked repo is not a GitHub repository URL." };
  }
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ private: visibility === "private" }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
    });
  } catch {
    return { ok: false, status: 502, error: "GitHub did not respond in time." };
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? "";
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: res.status,
      error: `GitHub refused to make ${parsed.owner}/${parsed.repo} ${visibility} (${res.status})`,
      detail,
    };
  }
  return { ok: true };
}

export async function deprovisionGithubRepo(
  token: string,
  gitUrl: string,
  mode: "archive" | "delete",
): Promise<DeprovisionResult> {
  const parsed = parseGithubRepoUrl(gitUrl);
  if (!parsed)
    return { ok: false, status: 400, error: "Linked repo is not a GitHub repository URL." };
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`, {
      method: mode === "delete" ? "DELETE" : "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: mode === "archive" ? JSON.stringify({ archived: true }) : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
    });
  } catch {
    return {
      ok: false,
      status: 502,
      error: `GitHub ${mode === "delete" ? "delete" : "archive"} timed out or was unreachable`,
    };
  }
  if (res.ok || res.status === 204) return { ok: true };
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.message ?? "";
  } catch {
    /* ignore */
  }
  return {
    ok: false,
    status: res.status === 404 ? 404 : 502,
    error: `GitHub ${mode === "delete" ? "delete" : "archive"} failed (${res.status})`,
    detail,
  };
}
