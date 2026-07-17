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

// Re-exported for existing importers; the implementation is the shared pure
// module so dispatch routing and workspace prep can never disagree.
export { normalizeGitHubCloneUrl } from "@/lib/git-url";
import { normalizeGitHubCloneUrl } from "@/lib/git-url";
import { ensureClaudeReady } from "@/lib/agent-execution/claude-prep";

/**
 * Auth via a per-invocation extraheader instead of embedding the token in the
 * remote URL. An embedded token persists in .git/config forever and leaks via
 * `git remote -v`, logs, and any agent that cats the config (observed: every
 * box workspace remote carried a plaintext OAuth token). The header exists
 * only for the lifetime of the command — same pattern actions/checkout uses.
 */
function authArgs(token: string): string[] {
  if (!token) return [];
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

function boxToken(): string {
  return (process.env.GITHUB_TOKEN || "").trim();
}

/** Strip a legacy embedded credential from origin so old clones stop leaking. */
function scrubRemoteUrl(boxDir: string): void {
  try {
    const url = execFileSync("git", ["-C", boxDir, "remote", "get-url", "origin"], { timeout: 15_000 })
      .toString().trim();
    const clean = url.replace(/^https:\/\/[^@/]+@/, "https://");
    if (clean !== url) execFileSync("git", ["-C", boxDir, "remote", "set-url", "origin", clean], { timeout: 15_000 });
  } catch {
    // No origin (empty scaffold dir) — nothing to scrub.
  }
}

function syncExistingClone(boxDir: string): void {
  if (!fs.existsSync(path.join(boxDir, ".git"))) return;
  scrubRemoteUrl(boxDir);
  const auth = authArgs(boxToken());
  try {
    execFileSync("git", [...auth, "-C", boxDir, "fetch", "--depth", "50", "origin"], {
      stdio: "inherit",
      timeout: 120_000,
    });
    execFileSync("git", [...auth, "-C", boxDir, "pull", "--ff-only"], { stdio: "inherit", timeout: 120_000 });
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
    console.log(`[box-prepare] cloning ${tab} ← ${gitUrl} → ${boxDir}`);
    // Clean URL in .git/config; the token travels only in the ephemeral header.
    execFileSync("git", [...authArgs(boxToken()), "clone", "--depth", "50", gitUrl, boxDir], {
      stdio: "inherit",
      timeout: 180_000,
    });
  } else if (requestedDir) {
    // The dispatch named a REAL directory that only exists on another machine
    // and there is no gitUrl to clone from. Inventing an empty dir here would
    // let the agent "work" on a phantom workspace and report success against
    // nothing (2026-07-14: a BiasLens dispatch routed to the box bootstrapped
    // a fresh Next app in an empty dir while the real scaffold sat on the
    // laptop). Fail loud so the ack records the truth and the operator sees a
    // failed command instead of confident garbage.
    throw new Error(
      `workspace for "${tab}" is not materializable on this builder: ${requestedDir} does not exist here and the project has no cloneable GitHub gitUrl${gitUrlRaw ? ` (unsupported URL: ${gitUrlRaw})` : ""}. Dispatch it to the machine that has the directory, or link a GitHub repo.`,
    );
  } else {
    console.log(
      `[box-prepare] no GitHub gitUrl for "${tab}"${gitUrlRaw ? ` (unsupported URL: ${gitUrlRaw})` : ""}; creating empty ${boxDir}`,
    );
    fs.mkdirSync(boxDir, { recursive: true });
  }

  ensureClaudeReady(boxDir);
  return boxDir;
}
