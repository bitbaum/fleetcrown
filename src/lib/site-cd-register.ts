/**
 * Server-side CD registration for a provisioned project.
 *
 * Prefer running scripts/hetzner/register-site.sh when this process is on the
 * studio box (script + deploy key present, eligible account). Otherwise seed
 * deploy.yml via the GitHub API and return the one command — never claim a
 * live site with no registration.
 */
import path from "path";
import { spawn } from "child_process";
import { GITHUB_API_BASE } from "@/lib/github-api";
import { HTTP_TIMEOUT_SHORT_MS } from "@/lib/constants/time";
import { setProjectLiveUrl } from "@/db/queries/atlas";
import { upsertEntityAttribute } from "@/db/queries/utils";
import { PROJECT_ATTR } from "@/config/project-attrs";
import { DEPLOY_WORKFLOW_PATH, planSiteCd, type SiteCdPlan } from "@/lib/site-cd";
import {
  probeRegisterSiteLocally,
  studioDevRoot,
  studioRepoRoot,
  type RegisterSiteGate,
} from "@/lib/site-cd-local";

export {
  canRunRegisterSiteLocally,
  probeRegisterSiteLocally,
  resolveDeployKeyPath,
  resolveRegisterScriptPath,
  studioDevRoot,
  studioRepoRoot,
  type RegisterSiteGate,
  type RegisterSiteLocalProbe,
} from "@/lib/site-cd-local";

export type SiteCdRegisterResult = {
  plan: Extract<SiteCdPlan, { ok: true }>;
  deployYmlSeeded: boolean;
  /** True only when register-site.sh finished successfully on this host. */
  registered: boolean;
  liveUrl: string | null;
  /** Present when registration still needs an operator/box step. */
  command: string | null;
  reason: string | null;
  /** Which local gate blocked auto-register, when applicable. */
  gate: RegisterSiteGate | null;
};

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

/** Ensure deploy.yml exists on the default branch (Contents API). Non-fatal.
 * Also repairs legacy `secrets: inherit` shims — inherit does not pass secrets
 * when the caller repo is outside the workflow owner's org (e.g. catomean → bitbaum).
 */
export async function ensureDeployWorkflow(
  token: string,
  owner: string,
  repo: string,
  yaml: string,
): Promise<boolean> {
  const pathEnc = DEPLOY_WORKFLOW_PATH.split("/").map(encodeURIComponent).join("/");
  const existing = await ghJson(token, `/repos/${owner}/${repo}/contents/${pathEnc}`);
  if (existing.ok) {
    const file = existing.json as { content?: string; sha?: string } | null;
    const raw = Buffer.from(file?.content ?? "", "base64").toString("utf8");
    if (raw.includes("secrets: inherit") && yaml.includes("HETZNER_SSH_PRIVATE_KEY")) {
      const put = await ghJson(token, `/repos/${owner}/${repo}/contents/${pathEnc}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `fix: pass HETZNER_SSH_PRIVATE_KEY explicitly for cross-owner deploy`,
          content: Buffer.from(yaml, "utf8").toString("base64"),
          sha: file?.sha,
          branch: "main",
        }),
      });
      return put.ok;
    }
    return true; // already present and OK
  }

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
  scriptPath: string;
  deployKeyPath: string;
}): Promise<{ ok: boolean; output: string }> {
  const script = args.scriptPath;
  const repoRoot = studioRepoRoot();
  const devRoot = studioDevRoot();
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
        env: {
          ...process.env,
          FLEETCROWN_REPO_ROOT: repoRoot,
          DEV_ROOT: devRoot,
          DEPLOY_KEY_PATH: args.deployKeyPath,
        },
        // register-site resolves FC_REPO from env; cwd is only a fallback.
        cwd: path.dirname(path.dirname(script)),
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
    const reason =
      "Shared bitbaum CD is studio-only (isDefault or FLEETCROWN_CLOUD_BUILDER_USER_IDS). Connect Fleet Runner for local work, or run the register command on the box.";
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
      reason,
      gate: "cloud-builder-private",
    };
  }

  const probe = probeRegisterSiteLocally();
  if (!probe.ok) {
    await upsertEntityAttribute(
      input.userId,
      input.entityProjectId,
      PROJECT_ATTR.NEXT_STEP,
      `${probe.reason ?? "Auto-register unavailable"} — ${plan.command}`,
    );
    return {
      plan,
      deployYmlSeeded,
      registered: false,
      liveUrl: null,
      command: plan.command,
      reason: probe.reason,
      gate: probe.gate,
    };
  }

  const ran = await runRegisterSiteScript({
    slug: plan.slug,
    repoFullName: input.repoFullName,
    title: input.projectName,
    scriptPath: probe.scriptPath!,
    deployKeyPath: probe.deployKeyPath!,
  });

  if (!ran.ok) {
    const reason = `register-site.sh failed — run manually. ${ran.output.slice(-400)}`;
    await upsertEntityAttribute(
      input.userId,
      input.entityProjectId,
      PROJECT_ATTR.NEXT_STEP,
      `${reason} — ${plan.command}`,
    );
    return {
      plan,
      deployYmlSeeded,
      registered: false,
      liveUrl: null,
      command: plan.command,
      reason,
      gate: "script-failed",
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
    gate: null,
  };
}
