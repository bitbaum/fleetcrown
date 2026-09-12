/**
 * Deleting a GitHub repository is the one teardown step FleetCrown cannot do:
 * neither the org token nor a user's OAuth grant carries `delete_repo`, on
 * purpose, so the app can never destroy code beyond recovery. These tests pin
 * both halves of that contract — the refusal says something a person can act
 * on, and no UI offers the button that would always fail.
 *
 * Run: npx tsx scripts/test/repo-delete-capability.ts
 */
import { readFileSync } from "node:fs";
import {
  GITHUB_DELETE_SCOPE,
  deprovisionGithubRepo,
  parseTokenScopes,
  repoDeleteNotPermitted,
} from "@/lib/github-provision";

// --- the header GitHub sends on every response, errors included ---
const parsed = parseTokenScopes("gist, read:org, repo, workflow");
if (parsed.length !== 4 || !parsed.includes("read:org") || parsed.includes("")) {
  throw new Error("scopes header should split and trim into four scopes");
}
if (parseTokenScopes(null).length !== 0 || parseTokenScopes("  ").length !== 0) {
  throw new Error("an absent or blank scopes header is no scopes, not one empty scope");
}

// --- the refusal has to be actionable, not a restated 403 ---
const refusal = repoDeleteNotPermitted(["repo", "workflow"], "bitbaum", "some-site");
if (refusal.ok || refusal.status !== 403) throw new Error("refusal should be a 403");
if (!refusal.error.toLowerCase().includes("not allowed to delete")) {
  throw new Error("refusal should say plainly that deleting is not allowed");
}
for (const needle of [
  GITHUB_DELETE_SCOPE,
  "repo, workflow",
  "Archive",
  "github.com/bitbaum/some-site/settings",
]) {
  if (!refusal.detail?.includes(needle)) {
    throw new Error(`refusal detail should name ${needle} — it is what the person does next`);
  }
}

async function checkGithubResponses() {
  // --- a 403 from GitHub is diagnosed, not parroted ---
  const realFetch = globalThis.fetch;
  function stub(status: number, scopes: string, body: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "x-oauth-scopes": scopes, "content-type": "application/json" },
      })) as typeof fetch;
  }

  stub(403, "gist, read:org, repo, workflow", { message: "Must have admin rights to Repository." });
  const missing = await deprovisionGithubRepo(
    "t",
    "https://github.com/bitbaum/some-site",
    "delete",
  );
  if (missing.ok || missing.status !== 403 || !missing.detail?.includes(GITHUB_DELETE_SCOPE)) {
    throw new Error("a 403 from a token without delete_repo should name the missing scope");
  }

  // A token that DOES hold the scope and still gets 403 has a different problem;
  // inventing a scope diagnosis there would send someone down the wrong path.
  stub(403, "delete_repo, repo", { message: "Must have admin rights to Repository." });
  const genuine = await deprovisionGithubRepo(
    "t",
    "https://github.com/bitbaum/some-site",
    "delete",
  );
  if (genuine.ok || genuine.detail?.includes(GITHUB_DELETE_SCOPE)) {
    throw new Error("a token holding delete_repo must not be told it lacks delete_repo");
  }

  // Archiving is the recoverable path and must keep working.
  stub(200, "gist, repo", {});
  const archived = await deprovisionGithubRepo(
    "t",
    "https://github.com/bitbaum/some-site",
    "archive",
  );
  if (!archived.ok) throw new Error("archive should succeed on a 200");
  globalThis.fetch = realFetch;
}

// --- and the UI must not offer what the token can never do ---
const teardown = readFileSync("src/components/projects/ProjectTeardown.tsx", "utf8");
if (teardown.includes('"delete-repo"')) {
  throw new Error(
    "ProjectTeardown offers delete-repo again — no FleetCrown token can perform it, so it would always fail",
  );
}
if (!teardown.includes("/settings")) {
  throw new Error("ProjectTeardown should point at GitHub's own settings page instead");
}

void checkGithubResponses().then(
  () => console.log("repo-delete-capability: ok"),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
