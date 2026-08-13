import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
// Import the dependency-free matcher helper directly. The public testing
// barrel also initializes Next's request AsyncLocalStorage, which is not
// available in this plain Node/tsx regression script.
import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils.js";

const root = path.resolve(import.meta.dirname, "../..");
const script = path.join(root, "scripts", "page-route-catalog.mjs");
const routes = JSON.parse(execFileSync(process.execPath, [script, "--json"], {
  cwd: root,
  encoding: "utf8",
})) as Array<{
  pattern: string;
  source: string;
  surface: string;
  dynamic: boolean;
  auditPath: string | null;
  access: "public" | "authenticated";
  auditMode: "page" | "isolated-action";
  expectedFinalPaths: string[] | null;
}>;

function cliLines(mode: string) {
  return execFileSync(process.execPath, [script, mode], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
}

const EXPECTED_PATTERNS = [
  "/", "/activity", "/agents", "/approvals", "/blog", "/changelog", "/control",
  "/control/import", "/control/import-local", "/control/new-from-scratch", "/control/workspace",
  "/decisions", "/digests", "/docs", "/docs/feedback-widget", "/docs/quickstart", "/download",
  "/duet", "/events", "/forgot-password", "/frontier", "/goals", "/habits", "/history",
  "/integrations/orangecat/build", "/investors", "/invite/[token]", "/license", "/loki",
  "/memory", "/mission", "/money", "/onboarding", "/people", "/philosophy", "/pricing",
  "/privacy", "/projects", "/projects/[id]", "/prompts", "/releases",
  "/reset-password/[token]", "/roadmap", "/settings", "/setup", "/share/project/[token]",
  "/sign-in", "/sign-out", "/sign-up", "/support", "/system", "/terminal", "/terms",
  "/thoughts", "/thoughts/[slug]", "/today", "/u/[username]", "/unlock", "/verify-email",
  "/verify-email/[token]", "/whitepaper", "/x-login/complete",
].sort();

assert.deepEqual(routes.map((route) => route.pattern), EXPECTED_PATTERNS, "filesystem page manifest drifted");
assert.equal(new Set(routes.map((route) => route.pattern)).size, routes.length, "page patterns must be unique");

assert.equal(routes.find((route) => route.pattern === "/money")?.surface, "private");
assert.equal(routes.find((route) => route.pattern === "/today")?.surface, "member");
assert.equal(routes.find((route) => route.pattern === "/sign-in")?.surface, "auth");
assert.equal(routes.find((route) => route.pattern === "/pricing")?.surface, "public");
assert.equal(routes.find((route) => route.pattern === "/x-login/complete")?.surface, "public");
assert.equal(routes.find((route) => route.pattern === "/x-login/complete")?.access, "public");
assert.equal(routes.find((route) => route.pattern === "/x-login/complete")?.auditMode, "isolated-action");
assert.equal(routes.find((route) => route.pattern === "/sign-out")?.access, "authenticated");
assert.equal(routes.find((route) => route.pattern === "/sign-out")?.auditMode, "isolated-action");
assert.deepEqual(routes.find((route) => route.pattern === "/duet")?.expectedFinalPaths, ["/agents"]);
assert.deepEqual(
  routes.find((route) => route.pattern === "/verify-email/[token]")?.expectedFinalPaths,
  ["/verify-email?error=invalid"],
);
assert.deepEqual(
  routes.find((route) => route.pattern === "/x-login/complete")?.expectedFinalPaths,
  ["/sign-in?error=CredentialsSignin&code=credentials"],
);
assert.ok(routes.find((route) => route.pattern === "/thoughts/[slug]")?.auditPath?.startsWith("/thoughts/"));
assert.equal(routes.find((route) => route.pattern === "/projects/[id]")?.auditPath, null);

// The route catalog drives smoke/browser access contexts while proxy.ts is the
// production enforcement policy. Exercise Next's own matcher against all 62
// patterns so the two cannot silently drift. Data-owned dynamic routes still
// participate through a matcher-only synthetic path.
const proxySource = fs.readFileSync(path.join(root, "src", "proxy.ts"), "utf8");
const matcherBlock = proxySource.match(/matcher:\s*\[([\s\S]*?)\]\s*,?\s*\}/)?.[1];
const matcher = matcherBlock?.match(/(["'`])((?:\\.|(?!\1)[\s\S])*)\1\s*,?/)?.[2];
assert.ok(matcher, "proxy.ts must expose one literal matcher for the access-policy contract");
for (const route of routes) {
  const policyPath = route.auditPath ?? route.pattern
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "audit-value")
    .replace(/\[\.\.\.[^\]]+\]/g, "audit-value")
    .replace(/\[[^\]]+\]/g, "audit-value");
  const middlewareMatches = unstable_doesMiddlewareMatch({
    config: { matcher: [matcher] },
    url: `https://fleetcrown.example${policyPath}`,
  });
  const authorizedPublicOverride = policyPath.startsWith("/x-login/");
  const productionAccess = !middlewareMatches || authorizedPublicOverride ? "public" : "authenticated";
  assert.equal(route.access, productionAccess, `${route.pattern} access drifted from proxy/auth policy`);
}
assert.deepEqual(
  cliLines("--public-audit-paths"),
  routes.filter((route) => route.auditPath && route.access === "public").map((route) => route.auditPath),
);
assert.deepEqual(
  cliLines("--authenticated-audit-paths"),
  routes.filter((route) => route.auditPath && route.access === "authenticated").map((route) => route.auditPath),
);

console.log(`page-route-catalog: ${routes.length} filesystem page patterns discovered`);
