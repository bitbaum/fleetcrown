#!/usr/bin/env node

/**
 * Filesystem-backed page-route catalog.
 *
 * App Router `page.tsx` files under `src/app` are the source of truth. Smoke tests, browser audits,
 * and human-readable inventories consume this module instead of maintaining
 * route arrays that silently drift as pages are added.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
export const APP_DIR = path.join(REPO_ROOT, "src", "app");

const AUTH_ROUTE_PREFIXES = [
  "/forgot-password",
  "/invite/",
  "/reset-password/",
  "/sign-in",
  "/sign-up",
  "/verify-email",
];

const MEMBER_ROUTE_PREFIXES = [
  "/integrations/orangecat/build",
  "/onboarding",
  "/sign-out",
];

const ISOLATED_ACTION_ROUTES = new Set(["/sign-out", "/x-login/complete"]);
const EXPECTED_REDIRECTS = {
  "/decisions": ["/activity"],
  "/digests": ["/activity"],
  "/duet": ["/agents"],
  "/history": ["/activity"],
  // The browser audit signs in as an established owner. A completed owner
  // must leave onboarding for the app home; first-run states are covered by
  // the dedicated onboarding tests.
  "/onboarding": ["/today"],
  "/sign-out": ["/sign-in"],
  // No x1_ticket is installed by the non-mutating audit, so the credentials
  // hop must fail safely back to sign-in rather than minting a session.
  "/x-login/complete": ["/sign-in?error=CredentialsSignin&code=credentials"],
  "/verify-email/[token]": ["/verify-email?error=invalid"],
};

/** Dynamic routes that have a deterministic, non-mutating audit fixture. */
const SAFE_DYNAMIC_FIXTURES = {
  "/invite/[token]": "/invite/fleetcrown-audit-invalid-token",
  "/reset-password/[token]": "/reset-password/fleetcrown-audit-invalid-token",
  "/verify-email/[token]": "/verify-email/fleetcrown-audit-invalid-token",
};

function walkPages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkPages(absolute);
    return entry.isFile() && entry.name === "page.tsx" ? [absolute] : [];
  });
}

function routePatternForFile(file) {
  const segments = path.relative(APP_DIR, file).split(path.sep).slice(0, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith("@"));
  return segments.length ? `/${segments.join("/")}` : "/";
}

function surfaceFor(file, pattern) {
  const relative = path.relative(APP_DIR, file).split(path.sep);
  if (relative.includes("(private)")) return "private";
  if (relative.includes("(app)")) return "member";
  if (pattern === "/setup") return "setup";
  if (pattern === "/onboarding") return "onboarding";
  if (AUTH_ROUTE_PREFIXES.some((prefix) => pattern === prefix || pattern.startsWith(prefix))) return "auth";
  if (MEMBER_ROUTE_PREFIXES.some((prefix) => pattern === prefix || pattern.startsWith(prefix))) return "member";
  return "public";
}

function accessFor(surface) {
  return ["member", "private", "onboarding"].includes(surface) ? "authenticated" : "public";
}

function requirementFor(pattern) {
  if (!pattern.includes("[")) return null;
  if (pattern === "/thoughts/[slug]") return "filesystem thought slug";
  if (pattern === "/projects/[id]") return "authenticated project UUID";
  if (pattern === "/share/project/[token]") return "active project-share token";
  if (pattern === "/u/[username]") return "public username";
  if (pattern === "/invite/[token]") return "invitation token (invalid fixture exercises the expired state)";
  if (pattern === "/reset-password/[token]") return "password-reset token (invalid fixture exercises form shell only)";
  if (pattern === "/verify-email/[token]") return "email-verification token (invalid fixture exercises error redirect)";
  return "runtime fixture";
}

function firstThoughtPath() {
  const dir = path.join(REPO_ROOT, "content", "thoughts");
  const file = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort()[0]
    : null;
  return file ? `/thoughts/${file.replace(/\.md$/, "")}` : null;
}

/** Discover every App Router page pattern directly from the filesystem. */
export function discoverPageRoutes() {
  return walkPages(APP_DIR)
    .map((file) => {
      const pattern = routePatternForFile(file);
      const dynamic = pattern.includes("[");
      let auditPath = dynamic ? SAFE_DYNAMIC_FIXTURES[pattern] ?? null : pattern;
      if (pattern === "/thoughts/[slug]") auditPath = firstThoughtPath();
      return {
        pattern,
        source: path.relative(REPO_ROOT, file),
        surface: surfaceFor(file, pattern),
        dynamic,
        auditPath,
        fixtureRequirement: requirementFor(pattern),
        auditMode: ISOLATED_ACTION_ROUTES.has(pattern) ? "isolated-action" : "page",
        expectedFinalPaths: EXPECTED_REDIRECTS[pattern] ?? null,
      };
    })
    .map((route) => ({ ...route, access: accessFor(route.surface) }))
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

export function unresolvedDynamicRoutes(routes = discoverPageRoutes()) {
  return routes.filter((route) => route.dynamic && !route.auditPath);
}

export function routeCatalogMarkdown(routes = discoverPageRoutes()) {
  const lines = [
    "| Route pattern | Surface | Browser fixture | Source |",
    "| --- | --- | --- | --- |",
  ];
  for (const route of routes) {
    const fixture = route.auditPath
      ? `\`${route.auditPath}\``
      : `Requires ${route.fixtureRequirement}`;
    lines.push(`| \`${route.pattern}\` | ${route.surface} | ${fixture} | \`${route.source}\` |`);
  }
  return lines.join("\n");
}

function printHelp() {
  console.log(`Usage: node scripts/page-route-catalog.mjs [--json|--markdown|--patterns|--audit-paths|--public-audit-paths|--authenticated-audit-paths|--audit-tsv|--unresolved]\n\n` +
    "Routes are discovered from page.tsx files under src/app. Audit-path modes emit static paths plus deterministic dynamic fixtures.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = discoverPageRoutes();
  const mode = process.argv[2] ?? "--patterns";
  if (mode === "--json") console.log(JSON.stringify(routes, null, 2));
  else if (mode === "--markdown") console.log(routeCatalogMarkdown(routes));
  else if (mode === "--patterns") routes.forEach((route) => console.log(route.pattern));
  else if (mode === "--audit-paths") routes.filter((route) => route.auditPath).forEach((route) => console.log(route.auditPath));
  else if (mode === "--public-audit-paths") routes.filter((route) => route.auditPath && route.access === "public").forEach((route) => console.log(route.auditPath));
  else if (mode === "--authenticated-audit-paths") routes.filter((route) => route.auditPath && route.access === "authenticated").forEach((route) => console.log(route.auditPath));
  else if (mode === "--audit-tsv") routes.filter((route) => route.auditPath).forEach((route) => console.log([
    route.access,
    route.pattern,
    route.auditPath,
    (route.expectedFinalPaths ?? []).join(","),
    route.auditMode,
  ].join("|")));
  else if (mode === "--unresolved") unresolvedDynamicRoutes(routes).forEach((route) => console.log(`${route.pattern}\t${route.fixtureRequirement}`));
  else printHelp();
}
