// Hosted runner — spin up a NEW site from a dispatched command.
//
// The gap this closes: the fleet can already analyze a repo (hosted_analyze)
// and change one (hosted_dispatch → Hermes → branch → PR). It could not CREATE
// one. So every site so far — causius on 2026-09-10 included — was made by a
// person typing `new-site.sh` into a terminal, which means the "software
// factory" had a human at the only step that starts anything.
//
// WHY THIS IS NOT AN AGENT, AND MUST NOT BECOME ONE
//
// The older control path (api/control/tab-inject-raw) works by injecting FREE
// TEXT into a live terminal for an agent to obey. That is powerful and it is
// exactly the shape that gets prompt-injected: whatever reaches the queue
// becomes instructions, and the blast radius is a real shell on a real box.
//
// Creating a site does not need that. It is a CLOSED operation with four
// parameters, and `new-site.sh` is already the audited implementation of it. So
// this command carries a typed payload, validates every field against a fixed
// grammar, and passes them as an ARGUMENT VECTOR — never a shell string, never
// a prompt. Nothing a caller writes is ever interpreted as either. A malicious
// or confused payload gets rejected by `validateNewSiteRequest` or by the
// script's own refusals; it cannot become a command.
//
// Keep it that way. If a future version wants "and then build the site", that
// is a SEPARATE hosted_dispatch to Hermes against the repo this created —
// sandboxed, PR-reviewed, and unable to reach the provisioning path.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The register's vocabulary. Mirrors apps.conf's documented columns. */
export const SITE_KINDS = [
  "product",
  "client-app",
  "client-site",
  "demo",
  "infra",
  "library",
] as const;
export const SITE_STATUSES = [
  "live",
  "prospect",
  "validating",
  "demo",
  "unverified",
  "handed-over",
  "archived",
] as const;

export type SiteKind = (typeof SITE_KINDS)[number];
export type SiteStatus = (typeof SITE_STATUSES)[number];

export type NewSiteRequest = {
  slug: string;
  title: string;
  kind: SiteKind;
  status: SiteStatus;
};

/**
 * Labels that must never become a site.
 *
 * new-site.sh has its own copy and REFUSES on it, and that script stays the
 * authority — this list exists so a bad request dies before it reaches a
 * process, not instead of the script's check. Two independent refusals of the
 * same class is defence in depth; if they ever disagree, the script wins and
 * this list is the one that is wrong.
 */
const RESERVED = new Set([
  "www",
  "api",
  "app",
  "admin",
  "support",
  "security",
  "billing",
  "pay",
  "wallet",
  "login",
  "auth",
  "account",
  "mail",
  "smtp",
  "imap",
  "ns1",
  "ns2",
  "mx",
  "cdn",
  "static",
  "assets",
  "vpn",
  "db",
  "status",
  "staging",
  "dev",
  "test",
  "preview",
  "bridge",
  "fleetcrown",
  "orangecat",
  "supabase",
  "solon",
  "evig",
  "revampit",
  "root",
  "system",
]);

/**
 * A slug becomes a DNS label, a TLS subject, a directory and a systemd unit.
 * Same grammar new-site.sh enforces: lowercase alphanumerics and hyphens, never
 * leading or trailing a hyphen, 63 characters max (the DNS label limit).
 */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The title is the only free-ish field — it reaches the scaffold as a
 * substituted string and ends up in the page and metadata. It never reaches a
 * shell (argument vector, see below), so the danger is not injection but
 * nonsense: control characters and newlines corrupt the env file and the
 * register row, both of which are line-oriented.
 */
const TITLE_FORBIDDEN = /[\p{Cc}\p{Cf}|]/u;

export type ValidationResult = { ok: true; value: NewSiteRequest } | { ok: false; reason: string };

/** Validate a dispatched payload. Pure — the unit suite runs it with no infra. */
export function validateNewSiteRequest(input: unknown): ValidationResult {
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
  if (RESERVED.has(slug)) {
    return {
      ok: false,
      reason: `slug "${slug}" is reserved (infrastructure or impersonation risk)`,
    };
  }

  // Default the title to the slug, exactly as new-site.sh does, so the two
  // paths cannot disagree about what an untitled site is called.
  const rawTitle = typeof p.title === "string" && p.title.trim() ? p.title.trim() : slug;
  if (rawTitle.length > 60) return { ok: false, reason: "title must be 60 characters or fewer" };
  if (TITLE_FORBIDDEN.test(rawTitle)) {
    return { ok: false, reason: "title must not contain control characters or '|'" };
  }

  const kind = p.kind as SiteKind;
  if (!SITE_KINDS.includes(kind)) {
    return { ok: false, reason: `kind must be one of: ${SITE_KINDS.join(", ")}` };
  }

  const status = p.status as SiteStatus;
  if (!SITE_STATUSES.includes(status)) {
    return { ok: false, reason: `status must be one of: ${SITE_STATUSES.join(", ")}` };
  }

  // The register's terms columns are unanswerable later; new-site.sh refuses a
  // live client engagement without --plan/--price. Rather than accept money
  // terms over a queue, this path simply cannot create one — dispatch it as
  // `prospect` and a human flips it to live with the terms.
  if (status === "live" && (kind === "client-app" || kind === "client-site")) {
    return {
      ok: false,
      reason: "a live client engagement needs plan and price; dispatch it as prospect instead",
    };
  }

  return { ok: true, value: { slug, title: rawTitle, kind, status } };
}

/**
 * Build the argument vector for new-site.sh.
 *
 * Exported so a test can assert the shape WITHOUT running anything. The whole
 * safety argument of this module is "these are arguments, not a command line",
 * and an argument vector is the only form in which that is checkable.
 */
export function newSiteArgv(scriptPath: string, req: NewSiteRequest): string[] {
  return [scriptPath, req.slug, "--title", req.title, "--kind", req.kind, "--status", req.status];
}

/**
 * Provisioning is OFF unless explicitly switched on for this runner.
 *
 * A command type that creates public repositories, DNS-visible hosts and TLS
 * certificates should not start working merely because it was merged. The
 * runner that is allowed to do it says so out loud, in its own environment.
 */
export function siteFactoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FLEETCROWN_SITE_FACTORY === "1";
}

export type NewSiteResult =
  { ok: true; host: string; repo: string; output: string } | { ok: false; error: string };

/**
 * Run the scaffold. `execFile`, not `exec` — no shell is involved at any point,
 * so none of the validated fields can be reinterpreted as syntax.
 */
export async function runNewSite(
  req: NewSiteRequest,
  opts: { scriptPath: string; baseDomain: string; owner: string; timeoutMs?: number },
): Promise<NewSiteResult> {
  if (!siteFactoryEnabled()) {
    return {
      ok: false,
      error: "site factory is not enabled on this runner (FLEETCROWN_SITE_FACTORY)",
    };
  }
  try {
    const { stdout, stderr } = await run("bash", newSiteArgv(opts.scriptPath, req), {
      timeout: opts.timeoutMs ?? 20 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return {
      ok: true,
      host: `${req.slug}.${opts.baseDomain}`,
      repo: `github.com/${opts.owner}/${req.slug}`,
      output: `${stdout}\n${stderr}`.trim(),
    };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // The script's own refusals are the useful part of a failure — surface them
    // rather than a bare non-zero exit.
    return { ok: false, error: (e.stderr || e.stdout || e.message || "scaffold failed").trim() };
  }
}
