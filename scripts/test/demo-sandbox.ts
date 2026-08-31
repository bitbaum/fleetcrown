/**
 * Inline tests for the demo sandbox policy (src/config/demo.ts).
 *
 * Why this file is the important half of the feature: the policy is a list of
 * paths, and a list cannot see what is not on it. Two silent failure modes
 * follow, and both have already shipped elsewhere in this fleet:
 *
 *   1. A deny rule on a path the proxy matcher EXCLUDES reads as protection and
 *      enforces nothing — the request never reaches authorized(). Eight of the
 *      first draft's entries were exactly this.
 *   2. A route family added next month is denied by nothing, because the list
 *      was written before it existed. The demo then gets a spending endpoint
 *      and no one finds out until the bill.
 *
 * So the tests below assert reachability and coverage against what is ACTUALLY
 * ON DISK, not against a fixture. A new API route family fails this suite until
 * someone classifies it as safe or denied — which is the point.
 *
 * Pure: reads source files, no DB, no network.
 *
 * Run: npx tsx scripts/test/demo-sandbox.ts
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  DEMO_DENIED_PREFIXES,
  DEMO_DENIED_GET_PREFIXES,
  DEMO_HANDLER_ENFORCED,
  DEMO_SAFE_FAMILIES,
  DEMO_WRITE_CARVEOUTS,
  DEMO_DENIAL_COPY,
  DEMO_PARTIAL_PREFIXES,
  demoDenialFor,
  isDemoEmail,
  DEMO_EMAIL,
} from "@/config/demo";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
let passed = 0;
const ok = (condition: boolean, message: string) => {
  assert(condition, message);
  passed += 1;
};

// ── The proxy matcher, as the runtime actually applies it ────────────────────
// Extracted from source rather than hand-copied: a hand-copied duplicate of the
// matcher would drift from the real one and the test would pass while the app
// behaved differently. The \\. in the TS string literal is a single \. in the
// compiled regex, hence the unescape.
function proxyMatcher(): RegExp {
  const src = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
  const m = src.match(/"(\/\(\(\?!.*?)",?\s*\]/s);
  assert(Boolean(m), "could not find the matcher regex in src/proxy.ts — did the file move?");
  return new RegExp("^" + m![1].replace(/\\\\/g, "\\") + "$");
}
const MATCHER = proxyMatcher();

// Sanity-check the extraction itself. If this fails, every reachability
// assertion below is meaningless — a broken extractor that matches everything
// would silently "pass" the whole suite.
ok(
  MATCHER.test("/api/control/dispatch"),
  "extractor sanity: /api/control must be matcher-reachable",
);
ok(!MATCHER.test("/api/health"), "extractor sanity: /api/health must be matcher-excluded");

// ── 1. Every middleware-enforced prefix is actually reachable ────────────────
// Two claims, because a prefix can be half-gated: the bare path must reach the
// gate, and so must paths beneath it — unless the gap is declared in
// DEMO_PARTIAL_PREFIXES with a reason.
for (const [prefix] of [...DEMO_DENIED_PREFIXES, ...DEMO_DENIED_GET_PREFIXES]) {
  ok(
    MATCHER.test(prefix),
    `${prefix} is denied in DEMO_DENIED_PREFIXES but the proxy matcher EXCLUDES it — ` +
      `the gate can never fire. Move it to DEMO_HANDLER_ENFORCED and guard it in the handler.`,
  );
  const deepReachable = MATCHER.test(`${prefix}/probe`);
  const declaredPartial = prefix in DEMO_PARTIAL_PREFIXES;
  ok(
    deepReachable || declaredPartial,
    `${prefix} is gated, but paths BENEATH it are matcher-excluded, so the gate ` +
      `covers only the bare path. If that is intended, declare it in ` +
      `DEMO_PARTIAL_PREFIXES with the reason; if not, the sub-tree is unprotected.`,
  );
  ok(
    !declaredPartial || !deepReachable,
    `${prefix} is listed in DEMO_PARTIAL_PREFIXES but its sub-paths ARE reachable — ` +
      `the exemption is stale and now hides full coverage behind an excuse.`,
  );
}

// ── 2. Every handler-enforced prefix really is excluded, and really is guarded ─
for (const [prefix, , file] of DEMO_HANDLER_ENFORCED) {
  ok(
    !MATCHER.test(`${prefix}/probe`),
    `${prefix} is listed as handler-enforced, but the proxy matcher DOES reach it — ` +
      `put it in DEMO_DENIED_PREFIXES instead, where one rule covers every method.`,
  );
  const source = readFileSync(join(ROOT, file), "utf8");
  ok(
    /denyDemoInHandler|isDemoEmailBlocked|isDemoUserId|requireNotDemo/.test(source),
    `${file} is named as the enforcement point for ${prefix} but calls no demo guard — ` +
      `DEMO_HANDLER_ENFORCED would be documenting protection nobody wrote.`,
  );
}

// ── 3. Every API family on disk is classified ────────────────────────────────
// The check that survives the next feature. Everything under src/app/api is
// either denied (by prefix or in a handler) or explicitly declared safe.
const apiDir = join(ROOT, "src/app/api");
const families = readdirSync(apiDir)
  .filter((f) => statSync(join(apiDir, f)).isDirectory())
  .sort();

const deniedFamilies = new Set(
  [...DEMO_DENIED_PREFIXES, ...DEMO_DENIED_GET_PREFIXES].map(([p]) => p.split("/")[2]),
);
const handlerFamilies = new Set(DEMO_HANDLER_ENFORCED.map(([p]) => p.split("/")[2]));
const safeFamilies = new Set(DEMO_SAFE_FAMILIES);

for (const family of families) {
  ok(
    deniedFamilies.has(family) || handlerFamilies.has(family) || safeFamilies.has(family),
    `/api/${family} is not classified for the demo sandbox. Add it to DEMO_DENIED_PREFIXES ` +
      `(if it can reach the box, someone's inbox, or a paid API) or to DEMO_SAFE_FAMILIES ` +
      `(if it only touches the caller's own tenant data). See src/config/demo.ts.`,
  );
}

// And the reverse: a family listed as safe that no longer exists is dead
// reassurance — it makes the classification look more complete than it is.
for (const family of DEMO_SAFE_FAMILIES) {
  ok(
    families.includes(family),
    `DEMO_SAFE_FAMILIES lists "${family}" but src/app/api/${family} does not exist — remove it.`,
  );
}

// ── 4. The matcher itself: longest prefix wins, carve-outs beat parents ──────
ok(
  demoDenialFor("/api/control/dispatch", "POST") === "dispatch",
  "control POST is dispatch-denied",
);
ok(
  demoDenialFor("/api/control/activity", "POST") === null,
  "the activity carve-out beats its denied parent",
);
ok(demoDenialFor("/api/control/activity/capture", "POST") === null, "carve-outs cover sub-paths");
ok(
  demoDenialFor("/api/control", "GET") === null,
  "reads are allowed — tenant scoping already limits them",
);
ok(demoDenialFor("/api/frontier", "GET") === "spend", "a GET that generates is still denied");
ok(demoDenialFor("/api/projects", "POST") === null, "the demo may create its own projects");
ok(demoDenialFor("/api/me/password", "PATCH") === "credentials", "the shared password is fixed");
ok(demoDenialFor("/api/me", "PATCH") === null, "…but the rest of /api/me stays editable");
ok(
  demoDenialFor("/api/controlled-substances", "POST") === null,
  "prefix matching must be path-segment aware, not a bare startsWith",
);

// Carve-outs must name a path under a denied parent, or they are misleading
// no-ops that suggest an exception exists where nothing was ever blocked.
for (const carveout of DEMO_WRITE_CARVEOUTS) {
  const parentDenied = DEMO_DENIED_PREFIXES.some(([p]) => carveout.startsWith(`${p}/`));
  ok(parentDenied, `carve-out ${carveout} has no denied parent — it exempts nothing.`);
}

// ── 5. Every reason has copy, and the copy explains rather than scolds ───────
const reasons = new Set([
  ...DEMO_DENIED_PREFIXES.map(([, r]) => r),
  ...DEMO_DENIED_GET_PREFIXES.map(([, r]) => r),
  ...DEMO_HANDLER_ENFORCED.map(([, r]) => r),
]);
for (const reason of reasons) {
  const copy = DEMO_DENIAL_COPY[reason];
  ok(
    Boolean(copy) && copy.length > 30,
    `denial reason "${reason}" needs copy a visitor can act on — a bare 403 reads as a broken app.`,
  );
}

// ── 6. Identity ──────────────────────────────────────────────────────────────
ok(isDemoEmail(DEMO_EMAIL), "the demo email identifies itself");
ok(
  isDemoEmail(` ${DEMO_EMAIL.toUpperCase()} `),
  "case and surrounding space must not defeat the check",
);
ok(!isDemoEmail("demo@fleetcrown.app.attacker.example"), "a suffix must not match");
ok(
  !isDemoEmail(null) && !isDemoEmail(undefined) && !isDemoEmail(""),
  "absent email is not the demo",
);

console.log(
  `✓ demo sandbox — ${passed} assertions passed (${families.length} API families classified)`,
);
