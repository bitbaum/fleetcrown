/**
 * Taking a site DOWN — the inverse of new-site.ts, and the half that was
 * missing.
 *
 * The factory could create a GitHub repository, an apps.conf row (which
 * allocates a port), a checkout, /opt/<slug>, a systemd unit, a Caddy vhost
 * and a monitoring target. Deleting the project undid exactly one of those —
 * the repository — so a site the operator had finished with kept serving to
 * the whole internet, on a wildcard DNS record, with a valid certificate, and
 * its port could never be reclaimed.
 *
 * Same shape as new-site for the same reasons: a CLOSED set of parameters
 * validated against a fixed grammar and handed to the script as an ARGUMENT
 * VECTOR (execFile, no shell), so nothing here can be reinterpreted as syntax.
 * The refusals are refusals, never repairs.
 *
 * `plan` is the mode that matters. Destroying infrastructure on the strength
 * of a single click is how the wrong site goes down, so the default answer to
 * "retire this" is a list of exactly what would be touched, and the script
 * carries it out only when asked a second time.
 */
import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

/**
 * What "take it down" is allowed to mean. Ordered least to most destructive —
 * the UI shows them in this order, and it is also the order of no return.
 */
export const RETIRE_MODES = [
  /** Stop serving it publicly. Nothing is destroyed; `restore` puts it back. */
  "offline",
  /** Keep serving, behind a password, and make the repository private. */
  "private",
  /** Undo an offline/private: regenerate the unit and vhost, start the app. */
  "restore",
  /** Remove it from the box entirely and free its port. */
  "delete",
] as const;
export type RetireMode = (typeof RETIRE_MODES)[number];

/** What happens to the GitHub repository, independently of the box. */
export const REPO_ACTIONS = ["keep", "private", "archive", "delete"] as const;
export type RepoAction = (typeof REPO_ACTIONS)[number];

export type RetireSiteRequest = {
  slug: string;
  mode: RetireMode;
  repo: RepoAction;
  /** A live client engagement needs a second, explicit hand. */
  forceClient: boolean;
};

/**
 * Never retirable by this path. These are not sites the product created: they
 * are the product. Taking fleetcrown or the bridge off Caddy would end the
 * session doing it, and `orangecat` is the apex every site hangs from.
 *
 * The script enforces the same list — this copy exists so a bad request is
 * refused at the door with a readable reason instead of a non-zero exit
 * minutes later, exactly as new-site.ts validates twice.
 */
const PROTECTED = new Set([
  "bridge",
  "fleetcrown",
  "orangecat",
  "bitbaum",
  "supabase",
  "solon",
  "evig",
  "revampit",
  "hirnli-tenants",
  "datacat-api",
  "datacat-web",
  "root",
  "system",
]);

/** Same grammar new-site.ts enforces: a slug is a DNS label. */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export type RetireValidation =
  { ok: true; value: RetireSiteRequest } | { ok: false; reason: string };

/** The repository action a mode implies when the caller does not say. */
export function defaultRepoAction(mode: RetireMode): RepoAction {
  if (mode === "private") return "private";
  // Archive, never delete: a deleted repository is the one step of this whole
  // teardown that nobody can undo, so it is never the default.
  if (mode === "delete") return "archive";
  return "keep";
}

export function validateRetireSiteRequest(input: unknown): RetireValidation {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "payload must be an object" };
  }
  const p = input as Record<string, unknown>;
  const slug = typeof p.slug === "string" ? p.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason: "slug must be lowercase letters, digits and hyphens, not starting or ending with one",
    };
  }
  if (PROTECTED.has(slug)) {
    return { ok: false, reason: `"${slug}" is infrastructure and cannot be retired` };
  }
  const mode = p.mode as RetireMode;
  if (!RETIRE_MODES.includes(mode)) {
    return { ok: false, reason: `mode must be one of: ${RETIRE_MODES.join(", ")}` };
  }
  const repo = (p.repo === undefined ? defaultRepoAction(mode) : p.repo) as RepoAction;
  if (!REPO_ACTIONS.includes(repo)) {
    return { ok: false, reason: `repo must be one of: ${REPO_ACTIONS.join(", ")}` };
  }
  // Restoring a site is about bringing it back; touching the repository in the
  // same breath is a different decision and would silently re-publish code.
  if (mode === "restore" && repo !== "keep") {
    return { ok: false, reason: "restore does not change the repository — pass repo: keep" };
  }
  return { ok: true, value: { slug, mode, repo, forceClient: p.forceClient === true } };
}

/**
 * Build the argument vector for retire-site.sh.
 *
 * `--go` is added only when the caller has confirmed. Without it the script
 * prints a plan and touches nothing, which is what makes a preview safe to run
 * from a route handler.
 */
export function retireSiteArgv(
  scriptPath: string,
  req: RetireSiteRequest,
  opts: { confirm: boolean },
): string[] {
  const argv = [scriptPath, req.slug, "--mode", req.mode, "--repo", req.repo];
  if (req.forceClient) argv.push("--force-client");
  if (opts.confirm) argv.push("--go");
  return argv;
}

/**
 * Retiring is OFF unless a runner is explicitly armed for it, and the switch is
 * the SAME one that arms creation: a runner allowed to bring public hosts into
 * being is the runner allowed to take them away, and no other should do either.
 */
export function siteFactoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FLEETCROWN_SITE_FACTORY === "1";
}

export type RetireSiteResult =
  { ok: true; confirmed: boolean; output: string } | { ok: false; error: string };

/** Run retire-site.sh. execFile, not exec — no shell is involved at any point. */
export async function runRetireSite(
  req: RetireSiteRequest,
  opts: { scriptPath: string; confirm: boolean; timeoutMs?: number },
): Promise<RetireSiteResult> {
  if (!siteFactoryEnabled()) {
    return {
      ok: false,
      error: "site factory is not enabled on this runner (FLEETCROWN_SITE_FACTORY)",
    };
  }
  try {
    const { stdout, stderr } = await run("bash", retireSiteArgv(opts.scriptPath, req, opts), {
      timeout: opts.timeoutMs ?? 10 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { ok: true, confirmed: opts.confirm, output: `${stdout}\n${stderr}`.trim() };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // The script's refusals ("is infrastructure", "LIVE client engagement") are
    // the useful part of a failure; a bare non-zero exit is not.
    return { ok: false, error: (e.stderr || e.stdout || e.message || "retire failed").trim() };
  }
}
