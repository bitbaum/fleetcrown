/**
 * Server-side CD registration for a provisioned project.
 *
 * Prefer running scripts/hetzner/register-site.sh when this process is on the
 * studio box (script + deploy key present, eligible account). Otherwise seed
 * deploy.yml via the GitHub API and return the one command — never claim a
 * live site with no registration.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { GITHUB_API_BASE } from "@/lib/github-api";
import { HTTP_TIMEOUT_SHORT_MS } from "@/lib/constants/time";
import { setProjectLiveUrl } from "@/db/queries/atlas";
import { upsertEntityAttribute } from "@/db/queries/utils";
import { PROJECT_ATTR } from "@/config/project-attrs";
import { DEPLOY_WORKFLOW_PATH, planSiteCd, type SiteCdPlan } from "@/lib/site-cd";

export type SiteCdRegisterResult = {
  plan: Extract<SiteCdPlan, { ok: true }>;
  deployYmlSeeded: boolean;
  /** True only when register-site.sh finished successfully on this host. */
  registered: boolean;
  liveUrl: string | null;
  /** Present when registration still needs an operator/box step. */
  command: string | null;
  reason: string | null;
};

function registerScriptPath(): string {
  if (process.env.FLEETCROWN_REGISTER_SITE_SCRIPT?.trim()) {
    return process.env.FLEETCROWN_REGISTER_SITE_SCRIPT.trim();
  }
  const repoRoot =
    process.env.FLEETCROWN_REPO_ROOT?.trim() ||
    path.join(process.env.FLEETCROWN_BOX_DEV_ROOT || path.join(os.homedir(), "dev"), "fleetcrown");
  const candidates = [
    path.join(repoRoot, "scripts/hetzner/register-site.sh"),
    path.join(process.cwd(), "scripts/hetzner/register-site.sh"),
    "/opt/fleetcrown/app/scripts/hetzner/register-site.sh",
  ];
  return (
    candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) ?? candidates[0]!
  );
}

function deployKeyPath(): string {
  return (
    process.env.DEPLOY_KEY_PATH?.trim() || path.join(os.homedir(), ".ssh/fleetcrown_ci_deploy")
  );
}

/** Studio box can auto-register when the trusted script and deploy key exist. */
export function canRunRegisterSiteLocally(): boolean {
  if (process.env.FLEETCROWN_SITE_CD_AUTO === "0") return false;
  try {
    return fs.existsSync(registerScriptPath()) && fs.existsSync(deployKeyPath());
  } catch {
    return false;
  }
}

async function ghJson(
  token: string,
  apiPath: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(`${GITHUB_API_BASE}${apiPath}`, {
    ...init,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_SHORT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  return { ok: res.ok, status: res.status, json };
}

/** Ensure deploy.yml exists on the default branch (Contents API). Non-fatal. */
export async function ensureDeployWorkflow(
  token: string,
  owner: string,
  repo: string,
  yaml: string,
): Promise<boolean> {
  const pathEnc = DEPLOY_WORKFLOW_PATH.split("/").map(encodeURIComponent).join("/");
  const existing = await ghJson(token, `/repos/${owner}/${repo}/contents/${pathEnc}`);
  if (existing.ok) return true; // already present

  const put = await ghJson(token, `/repos/${owner}/${repo}/contents/${pathEnc}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `chore: add self-host deploy shim for ${repo}`,
      content: Buffer.from(yaml, "utf8").toString("base64"),
      // Prefer main; GitHub uses the repo default when omitted on some APIs,
      // but Contents PUT wants an explicit branch when the repo is not empty.
      branch: "main",
    }),
  });
  return put.ok;
}

function runRegisterSiteScript(args: {
  slug: string;
  repoFullName: string;
  title: string;
}): Promise<{ ok: boolean; output: string }> {
  const script = registerScriptPath();
  return new Promise((resolve) => {
    const child = spawn(
      "bash",
      [
        script,
        args.slug,
        "--repo",
        args.repoFullName,
        "--title",
        args.title,
        // First deploy often fails on a fresh starter — registration + URL matter more.
        "--no-deploy",
      ],
      {
        env: { ...process.env },
        cwd: path.dirname(path.dirname(script)), // scripts/ → repo-ish; register-site resolves FC_REPO itself
      },
    );
    let output = "";
    child.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    child.on("error", (err) => {
      resolve({ ok: false, output: String(err) });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

/**
 * Seed deploy.yml, try box-local register-site.sh when eligible+possible,
 * record liveUrl only when registration actually ran.
 */
export async function registerProjectSiteCd(input: {
  userId: string;
  entityProjectId: string;
  userProjectId: string;
  projectName: string;
  repoFullName: string;
  template?: string | null;
  githubToken: string;
  /** Same gate as shared cloud builder — studio box CD is not multi-tenant. */
  cloudBuilderAllowed: boolean;
}): Promise<SiteCdRegisterResult | { ok: false; error: string; code: string }> {
  const plan = planSiteCd({
    projectName: input.projectName,
    repoFullName: input.repoFullName,
    template: input.template,
  });
  if (!plan.ok) return plan;

  const [owner, repo] = input.repoFullName.split("/");
  let deployYmlSeeded = false;
  if (owner && repo) {
    deployYmlSeeded = await ensureDeployWorkflow(input.githubToken, owner, repo, plan.deployYml);
  }

  // Do NOT write production_url / liveUrl until registration succeeds —
  // Check live resolves those and must not pretend a Caddy host exists yet.
  // predictedLiveUrl rides the API/UI response; next_step holds the command.

  if (!input.cloudBuilderAllowed) {
    await upsertEntityAttribute(
      input.userId,
      input.entityProjectId,
      PROJECT_ATTR.NEXT_STEP,
      `Register CD on the studio box: ${plan.command}`,
    );
    return {
      plan,
      deployYmlSeeded,
      registered: false,
      liveUrl: null,
      command: plan.command,
      reason:
        "Shared bitbaum CD is studio-only. Connect Fleet Runner for local work, or run the register command on the box.",
    };
  }

  if (!canRunRegisterSiteLocally()) {
    await upsertEntityAttribute(
      input.userId,
      input.entityProjectId,
      PROJECT_ATTR.NEXT_STEP,
      plan.command,
    );
    return {
      plan,
      deployYmlSeeded,
      registered: false,
      liveUrl: null,
      command: plan.command,
      reason:
        "Box register script or deploy key not available in this process — run the command on the studio box (same SSOT as new-site.sh).",
    };
  }

  const ran = await runRegisterSiteScript({
    slug: plan.slug,
    repoFullName: input.repoFullName,
    title: input.projectName,
  });

  if (!ran.ok) {
    await upsertEntityAttribute(
      input.userId,
      input.entityProjectId,
      PROJECT_ATTR.NEXT_STEP,
      plan.command,
    );
    return {
      plan,
      deployYmlSeeded,
      registered: false,
      liveUrl: null,
      command: plan.command,
      reason: `register-site.sh failed — run manually. ${ran.output.slice(-400)}`,
    };
  }

  await setProjectLiveUrl(input.userId, input.userProjectId, plan.liveUrl);
  await upsertEntityAttribute(
    input.userId,
    input.entityProjectId,
    PROJECT_ATTR.PRODUCTION_URL,
    plan.liveUrl,
  );
  await upsertEntityAttribute(
    input.userId,
    input.entityProjectId,
    PROJECT_ATTR.NEXT_STEP,
    `Live site registered: ${plan.liveUrl} — push to main deploys when CI is green.`,
  );

  return {
    plan,
    deployYmlSeeded,
    registered: true,
    liveUrl: plan.liveUrl,
    command: null,
    reason: null,
  };
}
