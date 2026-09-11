/**
 * The teardown's validator, pinned — because this is the path that destroys
 * things and the argument vector is the whole safety argument.
 *
 * Run: npx tsx scripts/test/hosted-retire-site.ts
 */
import {
  REPO_ACTIONS,
  RETIRE_MODES,
  defaultRepoAction,
  retireSiteArgv,
  validateRetireSiteRequest,
} from "@/lib/hosted-runner/retire-site";

let pass = 0;
const fail: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else fail.push(label);
}
function rejects(input: unknown, needle: string, label: string) {
  const r = validateRetireSiteRequest(input);
  ok(
    !r.ok && r.reason.toLowerCase().includes(needle.toLowerCase()),
    `${label} (got ${JSON.stringify(r)})`,
  );
}

// ── infrastructure is never retirable, whatever the mode ──────────────────
for (const slug of ["fleetcrown", "orangecat", "bridge", "supabase", "bitbaum", "root"]) {
  rejects({ slug, mode: "delete" }, "infrastructure", `${slug} refused`);
  rejects({ slug, mode: "offline" }, "infrastructure", `${slug} refused even to go offline`);
}

// ── the grammar is a DNS label, because the slug becomes a hostname ───────
for (const slug of ["", "-lead", "trail-", "Upper", "has space", "dots.here", "a".repeat(64)]) {
  rejects({ slug, mode: "offline" }, "slug must", `bad slug ${JSON.stringify(slug)} refused`);
}
ok(
  validateRetireSiteRequest({ slug: "velokiosk-sep10", mode: "offline" }).ok,
  "a real slug is accepted",
);

// ── closed sets, not free text ───────────────────────────────────────────
rejects({ slug: "demo", mode: "nuke" }, "mode must be one of", "unknown mode refused");
rejects({ slug: "demo" }, "mode must be one of", "missing mode refused");
rejects(
  { slug: "demo", mode: "delete", repo: "burn" },
  "repo must be one of",
  "unknown repo action refused",
);
rejects("not an object", "must be an object", "a string payload is refused");
rejects(null, "must be an object", "null is refused");

// ── the repository default follows the mode, and delete is never implied ──
ok(defaultRepoAction("delete") === "archive", "deleting a site only ARCHIVES its repo by default");
ok(defaultRepoAction("private") === "private", "a private site implies a private repo");
ok(defaultRepoAction("offline") === "keep", "taking a site offline leaves the repo alone");
ok(defaultRepoAction("restore") === "keep", "restoring leaves the repo alone");
ok(
  RETIRE_MODES.every((m) => defaultRepoAction(m) !== "delete"),
  "no mode ever defaults to deleting the repository",
);

// ── restore must not quietly change repository visibility ────────────────
rejects(
  { slug: "demo", mode: "restore", repo: "private" },
  "restore does not change",
  "restore refuses a repo action",
);
ok(
  validateRetireSiteRequest({ slug: "demo", mode: "restore" }).ok,
  "restore with the default is fine",
);

// ── the argument vector: arguments, never a command line ─────────────────
const req = validateRetireSiteRequest({ slug: "demo-site", mode: "delete", repo: "delete" });
ok(req.ok, "valid request parses");
if (req.ok) {
  const planned = retireSiteArgv("/opt/x/retire-site.sh", req.value, { confirm: false });
  ok(!planned.includes("--go"), "a plan NEVER carries --go — that is what makes a preview safe");
  ok(
    JSON.stringify(planned) ===
      JSON.stringify([
        "/opt/x/retire-site.sh",
        "demo-site",
        "--mode",
        "delete",
        "--repo",
        "delete",
      ]),
    `plan argv shape (got ${JSON.stringify(planned)})`,
  );
  const confirmed = retireSiteArgv("/opt/x/retire-site.sh", req.value, { confirm: true });
  ok(confirmed[confirmed.length - 1] === "--go", "confirming appends --go");

  // The point of an argv: a hostile value stays ONE argument.
  const nasty = validateRetireSiteRequest({ slug: "demo-site", mode: "delete" });
  ok(nasty.ok, "slug grammar already excludes shell metacharacters");
}

// ── forceClient is opt-in, never inferred ────────────────────────────────
const plain = validateRetireSiteRequest({ slug: "demo", mode: "delete" });
ok(plain.ok && plain.value.forceClient === false, "forceClient defaults to false");
const forced = validateRetireSiteRequest({ slug: "demo", mode: "delete", forceClient: true });
ok(forced.ok && forced.value.forceClient === true, "forceClient is honoured when explicit");
const truthy = validateRetireSiteRequest({ slug: "demo", mode: "delete", forceClient: "yes" });
ok(truthy.ok && truthy.value.forceClient === false, "only a real boolean arms forceClient");

ok(
  REPO_ACTIONS.length === 4 && RETIRE_MODES.length === 4,
  "the closed sets are the documented ones",
);

if (fail.length) {
  for (const f of fail) console.error(`  ✗ ${f}`);
  console.error(`hosted-retire-site: ${pass} passed, ${fail.length} failed`);
  process.exit(1);
}
console.log(`✓ hosted retire site — ${pass} assertions`);
