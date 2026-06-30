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

const UNATTENDED_ALLOW = ["Bash", "Edit", "Write", "Read", "Glob", "Grep", "WebFetch", "WebSearch", "MultiEdit", "TodoWrite"];

function ensureClaudeReady(dir: string): void {
  const home = os.homedir();
  const cfgPath = path.join(home, ".claude.json");
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

  const setPath = path.join(home, ".claude", "settings.json");
  let settings: { permissions?: { allow?: string[] } } = {};
  try { settings = JSON.parse(fs.readFileSync(setPath, "utf-8")); } catch { /* fresh settings */ }
  settings.permissions ??= {};
  const allow = new Set(settings.permissions.allow ?? []);
  for (const t of UNATTENDED_ALLOW) allow.add(t);
  settings.permissions.allow = [...allow];
  fs.mkdirSync(path.dirname(setPath), { recursive: true });
  fs.writeFileSync(setPath, JSON.stringify(settings, null, 2));
}

/** Normalize git URLs to https://github.com/owner/repo for unattended clone. */
export function normalizeGitHubCloneUrl(gitUrl: string): string | null {
  const trimmed = gitUrl.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return `https://github.com/${ssh[1]}.git`;
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(trimmed)) return trimmed;
  return null;
}

function authedUrl(gitUrl: string, token: string): string {
  if (!token) return gitUrl;
  return gitUrl.replace(/^https:\/\/(github\.com\/)/, `https://x-access-token:${token}@$1`);
}

function syncExistingClone(boxDir: string): void {
  if (!fs.existsSync(path.join(boxDir, ".git"))) return;
  try {
    execFileSync("git", ["-C", boxDir, "fetch", "--depth", "50", "origin"], {
      stdio: "inherit",
      timeout: 120_000,
    });
    execFileSync("git", ["-C", boxDir, "pull", "--ff-only"], { stdio: "inherit", timeout: 120_000 });
  } catch (e) {
    console.warn(`[box-prepare] git sync failed for ${boxDir}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

let cachedOwner: string | null = null;
async function ownerId(): Promise<string | null> {
  if (cachedOwner) return cachedOwner;
  cachedOwner = (await getSelfImprovementTarget())?.userId ?? null;
  return cachedOwner;
}

/** Resolve (and if needed create/clone) the box-local dir for a dispatched project. */
export async function ensureBoxWorkspace(tab: string, requestedDir: string): Promise<string> {
  if (requestedDir && fs.existsSync(requestedDir)) {
    ensureClaudeReady(requestedDir);
    return requestedDir;
  }

  const boxDir = path.join(DEV_ROOT, sanitizeKey(tab));
  if (fs.existsSync(boxDir)) {
    syncExistingClone(boxDir);
    ensureClaudeReady(boxDir);
    return boxDir;
  }

  const owner = await ownerId();
  const projects = owner ? await getUserProjects(owner) : [];
  const project = projects.find((p) => p.name.toLowerCase() === tab.toLowerCase());
  const gitUrlRaw = project?.gitUrl?.trim() ?? "";
  const gitUrl = gitUrlRaw ? normalizeGitHubCloneUrl(gitUrlRaw) : null;
  fs.mkdirSync(DEV_ROOT, { recursive: true });

  if (gitUrl) {
    const token = (process.env.GITHUB_TOKEN || "").trim();
    console.log(`[box-prepare] cloning ${tab} ← ${gitUrl} → ${boxDir}`);
    execFileSync("git", ["clone", "--depth", "50", authedUrl(gitUrl, token), boxDir], {
      stdio: "inherit",
      timeout: 180_000,
    });
  } else {
    console.log(
      `[box-prepare] no GitHub gitUrl for "${tab}"${gitUrlRaw ? ` (unsupported URL: ${gitUrlRaw})` : ""}; creating empty ${boxDir}`,
    );
    fs.mkdirSync(boxDir, { recursive: true });
  }

  ensureClaudeReady(boxDir);
  return boxDir;
}
