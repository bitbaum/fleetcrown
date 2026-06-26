/**
 * Box-runner workspace prep — make a dispatched project runnable on the box.
 *
 * A dispatch carries the LAPTOP dir (e.g. /home/g/dev/fleetcrown), which doesn't
 * exist on the always-on box. This resolves a box-local dir, clones the project
 * on demand from its gitUrl (GITHUB_TOKEN auth), and pre-trusts it for claude so
 * the agent launches unattended instead of hanging at the trust-folder gate.
 *
 * Loaded ONLY by the box-runner (FLEETCROWN_BOX_PREPARE=true), via dynamic import
 * from pty-runtime — keeps @/db + git out of the desktop Electron bundle.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { getUserProjects } from "@/db/queries/user-projects";
import { getSelfImprovementTarget } from "@/db/queries/frontier";

const DEV_ROOT = process.env.FLEETCROWN_BOX_DEV_ROOT || path.join(os.homedir(), "dev");

function sanitizeKey(tab: string): string {
  return tab.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

/** Mark a folder trusted in ~/.claude.json so claude skips its first-run trust
 *  gate (which blocks unattended launches). Idempotent. */
function ensureClaudeTrust(dir: string): void {
  const cfgPath = path.join(os.homedir(), ".claude.json");
  let cfg: { projects?: Record<string, Record<string, unknown>> } = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8")); } catch { /* fresh config */ }
  cfg.projects ??= {};
  const existing = cfg.projects[dir] ?? {};
  cfg.projects[dir] = {
    ...existing,
    hasTrustDialogAccepted: true,
    projectOnboardingSeenCount: Math.max(1, Number(existing.projectOnboardingSeenCount) || 0),
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

/** Inject a GitHub token into an https clone URL for unattended cloning. */
function authedUrl(gitUrl: string, token: string): string {
  if (!token) return gitUrl;
  return gitUrl.replace(/^https:\/\/(github\.com\/)/, `https://x-access-token:${token}@$1`);
}

let cachedOwner: string | null = null;
async function ownerId(): Promise<string | null> {
  if (cachedOwner) return cachedOwner;
  cachedOwner = (await getSelfImprovementTarget())?.userId ?? null;
  return cachedOwner;
}

/**
 * Resolve (and if needed create/clone) the box-local dir for a dispatched
 * project. Returns the dir the agent should launch in.
 *
 * - If the requested dir already exists on the box, use it (just trust it).
 * - Else clone the project's gitUrl into ~/dev/<key>, or — with no gitUrl —
 *   create an empty dir so the agent still launches.
 */
export async function ensureBoxWorkspace(tab: string, requestedDir: string): Promise<string> {
  if (requestedDir && fs.existsSync(requestedDir)) {
    ensureClaudeTrust(requestedDir);
    return requestedDir;
  }

  const boxDir = path.join(DEV_ROOT, sanitizeKey(tab));
  if (!fs.existsSync(boxDir)) {
    const owner = await ownerId();
    const project = owner
      ? (await getUserProjects(owner)).find((p) => p.name.toLowerCase() === tab.toLowerCase())
      : null;
    const gitUrl = project?.gitUrl?.trim();
    fs.mkdirSync(DEV_ROOT, { recursive: true });

    if (gitUrl && /^https:\/\/github\.com\//.test(gitUrl)) {
      const token = (process.env.GITHUB_TOKEN || "").trim();
      console.log(`[box-prepare] cloning ${tab} ← ${gitUrl} → ${boxDir}`);
      execFileSync("git", ["clone", "--depth", "50", authedUrl(gitUrl, token), boxDir], {
        stdio: "inherit",
        timeout: 180_000,
      });
    } else {
      console.log(`[box-prepare] no GitHub gitUrl for "${tab}"; creating empty ${boxDir}`);
      fs.mkdirSync(boxDir, { recursive: true });
    }
  }

  ensureClaudeTrust(boxDir);
  return boxDir;
}
