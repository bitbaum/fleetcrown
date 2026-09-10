/**
 * Live-site CD on bitbaum — the product half of scripts/hetzner/new-site.sh.
 *
 * Kickoff provisioning creates an agent-ready GitHub repo (starters in
 * project-templates). That is NOT the same path as live CD: apps.conf row,
 * deploy.yml → selfhost-deploy, HETZNER_SSH_PRIVATE_KEY, sync-infra. #550
 * documented the split; this module wires the product so Make it happen can
 * either complete registration or return ONE honest next step — never a fake
 * "site ready" with no URL.
 *
 * SSOT for the box-side steps: scripts/hetzner/register-site.sh
 * (apps.conf + secret + sync-infra). Prefer that over a parallel host.
 */
import { repoSlug } from "@/lib/github-provision";

/** Matches scripts/hetzner/_box-env.sh SITES_BASE_DOMAIN. */
export function sitesBaseDomain(): string {
  return (process.env.FLEETCROWN_SITES_BASE_DOMAIN ?? "orangecat.ch").trim() || "orangecat.ch";
}

/** Matches scripts/hetzner/_box-env.sh WORKFLOW_OWNER. */
export function workflowOwner(): string {
  return (process.env.FLEETCROWN_WORKFLOW_OWNER ?? "bitbaum").trim() || "bitbaum";
}

/**
 * Reserved DNS / infra labels — mirrored from new-site.sh. A kickoff that
 * claimed fleetcrown.orangecat.ch would be a hostile rename of the control plane.
 */
export const RESERVED_SITE_SLUGS = new Set([
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

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** DNS-safe slug for orangecat.ch — same rules as new-site.sh / repoSlug. */
export function siteCdSlug(name: string): string {
  return repoSlug(name);
}

export function isValidSiteSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SITE_SLUGS.has(slug);
}

export function siteCdLiveUrl(slug: string): string {
  return `https://${slug}.${sitesBaseDomain()}`;
}

/** The deploy.yml shim documented in docs/infrastructure/self-host-cd.md. */
export function deployWorkflowYaml(slug: string): string {
  const owner = workflowOwner();
  return `name: Deploy

# Push to main → deploy to bitbaum. All logic lives in one place:
# ${owner}/fleetcrown/.github/workflows/selfhost-deploy.yml
#
# Seeded by FleetCrown kickoff / register-cd so the repo is CD-ready once
# scripts/hetzner/register-site.sh (or auto-register on the box) adds the
# apps.conf row and deploy secret.
on:
  workflow_dispatch: {}
  push:
    branches: [main]

jobs:
  deploy:
    uses: ${owner}/fleetcrown/.github/workflows/selfhost-deploy.yml@main
    with:
      app: ${slug}
    secrets:
      HETZNER_SSH_PRIVATE_KEY: \${{ secrets.HETZNER_SSH_PRIVATE_KEY }}
`;
}

export const DEPLOY_WORKFLOW_PATH = ".github/workflows/deploy.yml";

/**
 * Starters that can ride selfhost-deploy (Node build + rsync). Others need a
 * different host — do not pretend orangecat.ch CD applies.
 */
export function templateSupportsSiteCd(template: string | null | undefined): boolean {
  return template === "nextjs-tailwind" || template === "bare";
}

export type RegisterSiteCommandInput = {
  slug: string;
  /** owner/repo or https git URL — passed through to register-site.sh --repo */
  repo: string;
  title?: string;
};

/** The one box-trusted command that completes CD registration. */
export function registerSiteCommand(input: RegisterSiteCommandInput): string {
  const title = (input.title ?? input.slug).replace(/'/g, `'\\''`);
  return `bash scripts/hetzner/register-site.sh ${input.slug} --repo ${input.repo} --title '${title}'`;
}

export type SiteCdPlan =
  | {
      ok: true;
      slug: string;
      liveUrl: string;
      deployYml: string;
      command: string;
    }
  | {
      ok: false;
      error: string;
      code: "invalid-slug" | "reserved-slug" | "unsupported-template";
    };

/** Plan CD registration for a provisioned project — pure, no I/O. */
export function planSiteCd(input: {
  projectName: string;
  repoFullName: string;
  template?: string | null;
}): SiteCdPlan {
  if (input.template && !templateSupportsSiteCd(input.template)) {
    return {
      ok: false,
      error: `Template "${input.template}" is not deployed via bitbaum self-host CD. Use a Next.js stack for https://*.${sitesBaseDomain()}, or host elsewhere.`,
      code: "unsupported-template",
    };
  }
  const slug = siteCdSlug(input.projectName);
  if (!slug || !SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: "Project name does not yield a DNS-safe slug (lowercase letters, digits, hyphens).",
      code: "invalid-slug",
    };
  }
  if (RESERVED_SITE_SLUGS.has(slug)) {
    return {
      ok: false,
      error: `'${slug}' is reserved (infrastructure). Rename the project before registering a live site.`,
      code: "reserved-slug",
    };
  }
  return {
    ok: true,
    slug,
    liveUrl: siteCdLiveUrl(slug),
    deployYml: deployWorkflowYaml(slug),
    command: registerSiteCommand({
      slug,
      repo: input.repoFullName,
      title: input.projectName,
    }),
  };
}
