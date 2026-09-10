/**
 * Box-local path probe for register-site.sh — no DB / GitHub I/O.
 * Used by site-cd-register and by tests that must not load DATABASE_URL.
 */
import fs from "fs";
import os from "os";
import path from "path";

export type RegisterSiteGate =
  "cloud-builder-private" | "auto-disabled" | "missing-script" | "missing-key" | "script-failed";

/** Studio DEV_ROOT — prefer the always-on box checkout over a laptop path. */
export function studioDevRoot(): string {
  if (process.env.FLEETCROWN_BOX_DEV_ROOT?.trim()) {
    return process.env.FLEETCROWN_BOX_DEV_ROOT.trim();
  }
  if (process.env.DEV_ROOT?.trim()) return process.env.DEV_ROOT.trim();
  // Production fleetcrown-app runs as ubuntu; durable clones live here.
  const ubuntuDev = "/home/ubuntu/dev";
  try {
    if (fs.existsSync(ubuntuDev)) return ubuntuDev;
  } catch {
    /* empty */
  }
  return path.join(os.homedir(), "dev");
}

export function studioRepoRoot(): string {
  if (process.env.FLEETCROWN_REPO_ROOT?.trim()) {
    return process.env.FLEETCROWN_REPO_ROOT.trim();
  }
  return path.join(studioDevRoot(), "fleetcrown");
}

function registerScriptCandidates(): string[] {
  if (process.env.FLEETCROWN_REGISTER_SITE_SCRIPT?.trim()) {
    return [process.env.FLEETCROWN_REGISTER_SITE_SCRIPT.trim()];
  }
  return [
    path.join(studioRepoRoot(), "scripts/hetzner/register-site.sh"),
    path.join(process.cwd(), "scripts/hetzner/register-site.sh"),
    "/opt/fleetcrown/app/scripts/hetzner/register-site.sh",
  ];
}

export function resolveRegisterScriptPath(): string | null {
  for (const p of registerScriptCandidates()) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* empty */
    }
  }
  return null;
}

function deployKeyCandidates(): string[] {
  const out: string[] = [];
  if (process.env.DEPLOY_KEY_PATH?.trim()) out.push(process.env.DEPLOY_KEY_PATH.trim());
  out.push(path.join(os.homedir(), ".ssh/fleetcrown_ci_deploy"));
  // Laptop SSOT when the app somehow runs as another user on a shared host.
  out.push("/home/g/.ssh/fleetcrown_ci_deploy");
  out.push("/home/ubuntu/.ssh/fleetcrown_ci_deploy");
  return [...new Set(out)];
}

export function resolveDeployKeyPath(): string | null {
  for (const p of deployKeyCandidates()) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* empty */
    }
  }
  return null;
}

export type RegisterSiteLocalProbe = {
  ok: boolean;
  gate: Exclude<RegisterSiteGate, "cloud-builder-private" | "script-failed"> | null;
  scriptPath: string | null;
  deployKeyPath: string | null;
  scriptCandidates: string[];
  keyCandidates: string[];
  reason: string | null;
};

/** Why auto-register can or cannot run in this process (no eligibility check). */
export function probeRegisterSiteLocally(): RegisterSiteLocalProbe {
  const scriptCandidates = registerScriptCandidates();
  const keyCandidates = deployKeyCandidates();
  if (process.env.FLEETCROWN_SITE_CD_AUTO === "0") {
    return {
      ok: false,
      gate: "auto-disabled",
      scriptPath: resolveRegisterScriptPath(),
      deployKeyPath: resolveDeployKeyPath(),
      scriptCandidates,
      keyCandidates,
      reason:
        "FLEETCROWN_SITE_CD_AUTO=0 — auto-register disabled. Unset it (or set to 1) on the studio box, or run the register command manually.",
    };
  }
  const scriptPath = resolveRegisterScriptPath();
  const deployKeyPath = resolveDeployKeyPath();
  if (!scriptPath) {
    return {
      ok: false,
      gate: "missing-script",
      scriptPath: null,
      deployKeyPath,
      scriptCandidates,
      keyCandidates,
      reason: `register-site.sh not found in this process (looked in: ${scriptCandidates.join(", ")}). Keep a durable checkout at ${studioRepoRoot()} on main, or set FLEETCROWN_REPO_ROOT / FLEETCROWN_REGISTER_SITE_SCRIPT.`,
    };
  }
  if (!deployKeyPath) {
    return {
      ok: false,
      gate: "missing-key",
      scriptPath,
      deployKeyPath: null,
      scriptCandidates,
      keyCandidates,
      reason: `Deploy key not readable in this process (looked in: ${keyCandidates.join(", ")}). On the studio box install it as /home/ubuntu/.ssh/fleetcrown_ci_deploy (chmod 600) or set DEPLOY_KEY_PATH — same key new-site.sh pipes into gh secret set.`,
    };
  }
  return {
    ok: true,
    gate: null,
    scriptPath,
    deployKeyPath,
    scriptCandidates,
    keyCandidates,
    reason: null,
  };
}

/** Studio box can auto-register when the trusted script and deploy key exist. */
export function canRunRegisterSiteLocally(): boolean {
  return probeRegisterSiteLocally().ok;
}
