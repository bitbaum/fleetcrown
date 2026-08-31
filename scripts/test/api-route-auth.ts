/**
 * Every API route must declare how it authenticates.
 *
 * WHY THIS EXISTS
 * ---------------
 * There is no `middleware.ts`. Every one of the 214 routes under src/app/api
 * guards itself, and it does so through one of ELEVEN different mechanisms —
 * four session getters, two private-zone wrappers, a cron secret, a runner
 * bearer, a widget token, an agent token, and shared webhook secrets. Each is
 * individually reasonable; they are layers, not duplicates.
 *
 * The problem is that the set is not knowable by inspection. An audit on
 * 2026-08-25 took SEVEN passes to enumerate it, and the first pass reported 44
 * unguarded routes — including /api/people and /api/memory — every one of them
 * a false alarm caused by a helper the grep did not know about yet. A property
 * that takes seven attempts to check by hand is a property nobody checks, and
 * the failure mode is silent: a new route ships with no guard, and looks
 * exactly like the 25 that are public on purpose.
 *
 * So the rule is not "use one helper" — collapsing genuine layers would be
 * worse. The rule is: EVERY route either names a known mechanism, or appears
 * below with a reason a human wrote down.
 *
 * This runs in `npm run verify` (globbed by scripts/test-unit.ts) and needs no
 * database, network, or server.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const API_ROOT = join(REPO, "src", "app", "api");

/**
 * Every mechanism that establishes WHO is calling. Adding a new one is a
 * deliberate act: it means a twelfth way to answer that question, so add it
 * here only after asking whether an existing layer already fits.
 */
const GUARDS = [
  // Session — src/lib/session.ts
  "getSessionUserId",
  "getApiUserId",
  "getApiActor",
  "resolveSessionUserId",
  // Session + private-zone PIN — src/lib/private-zone-api.ts
  "requirePrivateApiAccess", // also matches ...WithBearer
  // Scheduled jobs — src/lib/cron-auth.ts
  "requireCronAuth",
  // Machine callers
  "getBearerUserId", // ck_* runner/agent token, src/lib/runner-auth.ts
  "validateAgentToken",
  "getWidgetTokenByToken", // fcw_* write-only widget token
  // Signed webhooks from other services
  "WEBHOOK_SECRET",
  "stripe-signature",
  "constructEvent",
] as const;

/**
 * Routes that are public ON PURPOSE. The reason is the point of this list: it
 * is the only place the decision is written down, and the test below fails if
 * an entry stops being true, so it cannot quietly rot into a list of things
 * nobody re-examined.
 */
const PUBLIC: Record<string, string> = {
  // — Sign-in and account recovery. Public by definition: the caller has no
  //   session yet, which is the entire reason they are here.
  "auth/[...nextauth]": "NextAuth's own handler — owns the session it would otherwise check",
  "auth/register": "creates the account that a session would require",
  "auth/forgot-password": "pre-session recovery; guarded by emailed one-time token instead",
  "auth/reset-password": "pre-session recovery; the emailed token IS the credential",
  "auth/resend-verification":
    "pre-session; rate-limited, reveals nothing about whether the address exists",
  "x-login/start": "OAuth handshake begins before any session exists",
  "x-login/callback": "OAuth provider posts here; state parameter is the credential",

  // — The bearer IS the credential; there is no user to look up first.
  "invitations/[token]": "unguessable invite token in the path is the credential",
  "invitations/[token]/accept": "same token; accepting is what creates the membership",
  "share/task/[token]":
    "an assignee has no account by design — the minted share token in the path IS their credential, it is looked up with revoked links excluded, and the only write it permits is accept/decline/deliver on that one assignment",

  // — Bootstrap and installers. Deliberately fetchable without an account.
  setup: "first-run only — returns 409 once any user exists (verified)",
  "agent/install": "serves the agent CLI body so a new customer can install before signing in",
  "agent/daemon": "serves the shell daemon tarball; same bootstrap reason",

  // — Operator-local surfaces. These read the BOX's own state via TOOLS_DIR,
  //   not any user's records, so there is no per-user data to scope.
  github: "runs github-status.sh against the box; no user-scoped data in the response",
  calendar: "box-local calendar tool; no user-scoped data in the response",

  // — Intentional, with the reasoning recorded at the route itself.
  "debug-log": "client error reporter — see the route's own comment on why it takes no auth",
  health: "liveness probe; must answer before anything else works",
  newsletter: "public marketing signup — email address only",
  "control/transcribe": "one-line re-export of /api/beacon/transcribe, which carries the guard",
};

// ── walk ────────────────────────────────────────────────────────────────────
function routeFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(p, out);
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

const files = routeFiles(API_ROOT).sort();
if (files.length === 0) {
  console.error("✗ api-route-auth: found no route files — the walk is broken, not the routes");
  process.exit(1);
}

const problems: string[] = [];
const guarded = new Set<string>();
const claimedPublic = new Set<string>();

for (const file of files) {
  const id = relative(API_ROOT, dirname(file)).split("\\").join("/");
  const src = readFileSync(file, "utf8");
  const hasGuard = GUARDS.some((g) => src.includes(g));

  if (hasGuard) {
    guarded.add(id);
    // An allowlist entry for a route that now guards itself is stale, and a
    // stale exemption is how a real hole hides later.
    if (id in PUBLIC) {
      problems.push(
        `${id} is on the PUBLIC list but now calls a guard — delete its entry (it no longer describes the route)`,
      );
    }
    continue;
  }

  if (id in PUBLIC) {
    claimedPublic.add(id);
    continue;
  }

  problems.push(
    `${id} names no known auth mechanism and is not on the PUBLIC list.\n` +
      `      Add the guard it should use, or add it to PUBLIC in this file WITH THE REASON.`,
  );
}

// Entries pointing at routes that no longer exist: harmless today, misleading
// tomorrow when someone re-creates the path and inherits an exemption.
for (const id of Object.keys(PUBLIC)) {
  if (!claimedPublic.has(id) && !guarded.has(id)) {
    problems.push(`${id} is on the PUBLIC list but no such route exists — delete the entry`);
  }
}

if (problems.length > 0) {
  console.error("✗ api-route-auth:");
  for (const p of problems) console.error(`    ${p}`);
  process.exit(1);
}

console.log(
  `✓ api-route-auth: ${files.length} routes — ${guarded.size} guarded, ` +
    `${claimedPublic.size} public with a recorded reason`,
);
