/**
 * The site door refuses before it creates anything.
 *
 * WHY THIS EXISTS
 * ---------------
 * `POST /api/integrations/orangecat/site` is the first endpoint in this repo
 * that lets ANOTHER SERVICE cause a repository, a DNS record and a TLS
 * certificate to come into existence. Everything else that reaches the site
 * factory is an operator at a CLI.
 *
 * That changes what a bug costs. A missing session check on a read route leaks
 * data; a missing check here mints domains on somebody else's say-so, against
 * rate limits that are shared with every other site the studio runs and that
 * cannot be un-spent. So the refusals are the feature, and they are what this
 * gate checks — specifically the ones that must happen BEFORE any database or
 * queue is touched, because those are the ones that still hold when the rest of
 * the system is misconfigured.
 *
 * Runs in `pnpm run verify` (globbed by scripts/test-unit.ts). No database, no
 * network, no server.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SITE_KINDS, SITE_STATUSES } from "../../src/lib/hosted-runner/new-site";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ROUTE = join(REPO, "src/app/api/integrations/orangecat/site/route.ts");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  console.log("orangecat site door:");

  // ── the two refusals that must not need a database ─────────────────────────

  // Importing the route pulls in `@/db`, which demands a connection string at
  // module load even though nothing here ever runs a query — the refusals
  // under test all return before the first one. A syntactically valid URL
  // pointing at nothing satisfies the constructor without connecting; the same
  // line appears in agent-tool-loop.ts for the same reason. If a check below
  // ever DID reach the database, this would fail loudly rather than silently
  // talk to a real one.
  process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/test";

  const { POST, REMOTE_KINDS, FORCED_STATUS, DAILY_SITE_LIMIT } =
    await import("../../src/app/api/integrations/orangecat/site/route");

  function request(body: unknown, signature?: string): Request {
    const raw = JSON.stringify(body);
    return new Request("https://fleetcrown.orangecat.ch/api/integrations/orangecat/site", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-orangecat-signature": signature } : {}),
      },
      body: raw,
    });
  }

  const VALID_BODY = {
    actorId: "00000000-0000-4000-8000-000000000000",
    slug: "probe-site",
    title: "Probe Site",
    kind: "demo",
  };

  const originalSecret = process.env.ORANGECAT_WEBHOOK_SECRET;

  // Unconfigured must FAIL CLOSED. If an unset secret meant "skip the check",
  // a fresh deploy would be an open domain-minting endpoint until someone
  // remembered to set it.
  delete process.env.ORANGECAT_WEBHOOK_SECRET;
  const unconfigured = await POST(request(VALID_BODY) as never);
  check(
    "no shared secret configured → 503, not 200",
    unconfigured.status === 503,
    `got ${unconfigured.status}`,
  );

  // A wrong signature must be refused, and an ABSENT one must be refused the
  // same way — a missing header is not a pass.
  process.env.ORANGECAT_WEBHOOK_SECRET = "x".repeat(48);
  const unsigned = await POST(request(VALID_BODY) as never);
  check("no signature → 401", unsigned.status === 401, `got ${unsigned.status}`);

  const badlySigned = await POST(request(VALID_BODY, "sha256=deadbeef") as never);
  check("wrong signature → 401", badlySigned.status === 401, `got ${badlySigned.status}`);

  if (originalSecret === undefined) {
    delete process.env.ORANGECAT_WEBHOOK_SECRET;
  } else {
    process.env.ORANGECAT_WEBHOOK_SECRET = originalSecret;
  }

  // ── the vocabulary the door exposes is narrower than the factory's ─────────

  check(
    "remote callers get a SUBSET of the register's kinds, never all of them",
    REMOTE_KINDS.every((k: string) => (SITE_KINDS as readonly string[]).includes(k)) &&
      REMOTE_KINDS.length < SITE_KINDS.length,
    `route ${REMOTE_KINDS.join(",")} vs register ${SITE_KINDS.join(",")}`,
  );

  check(
    "no remote caller can claim a customer relationship",
    !REMOTE_KINDS.includes("client-app") && !REMOTE_KINDS.includes("infra"),
  );

  check(
    "the forced status is a real register status",
    (SITE_STATUSES as readonly string[]).includes(FORCED_STATUS),
  );

  // The status is FORCED, not defaulted. A site this door creates must never be
  // able to say it is live or handed over: those are human claims about a
  // customer relationship, and a scaffold establishes neither.
  const routeSource = readFileSync(ROUTE, "utf8");
  check(
    "status is forced, never read from the request body",
    !/status:\s*(parsed|body|json)/.test(routeSource) &&
      routeSource.includes("status: FORCED_STATUS"),
  );
  check(
    "the request schema does not accept a status at all",
    !/^\s*status:\s*z\./m.test(routeSource),
    "a caller-supplied status would defeat FORCED_STATUS",
  );
  check("forced status is not a live or handed-over claim", FORCED_STATUS === "unverified");

  // ── the quota exists and is finite ─────────────────────────────────────────

  check(
    "a per-account daily ceiling is set",
    Number.isInteger(DAILY_SITE_LIMIT) && DAILY_SITE_LIMIT > 0 && DAILY_SITE_LIMIT <= 10,
    `got ${DAILY_SITE_LIMIT}`,
  );

  // ── it must not build its own payload ──────────────────────────────────────
  // provision.ts is the SSOT precisely so a second caller cannot grow a
  // different set of checks. A route that reached past it into the queue would
  // skip slug validation and the reserved-label denylist.
  check(
    "provisioning goes through requestNewSite, not straight to the queue",
    routeSource.includes("requestNewSite") && !routeSource.includes("enqueueHostedNewSiteCommand"),
  );

  if (failures > 0) {
    console.error(`\norangecat site door: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("orangecat site door: all checks passed");
}

// Wrapped rather than written at the top level: this repo's gate runner
// compiles to CJS, where top-level await is a build error rather than a
// runtime one — so the script would not fail, it would fail to exist.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
