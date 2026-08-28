/**
 * Every scheduled job records what it did, somewhere that outlives the journal.
 * Run: npx tsx scripts/test/cron-outcome-persistence.ts
 *
 * The class this closes: a cron route computes a rich result, returns it in its
 * HTTP response, and nothing ever writes it down. The response body goes to
 * `curl` inside fc-cron.sh, which echoes it to the systemd journal — and this
 * box's journal is size-capped with no time limit, so a daily unit holds about
 * ONE day. After that the run is unreconstructable.
 *
 * It is not hypothetical. The frontier self-improvement loop ran from
 * 2026-06-24 to 2026-08-27 surfacing zero proposals. A taxonomy shipped on
 * 2026-08-25 to say WHY (dead model / unreadable reply / model found no match /
 * everything deduped), and it worked — but it reported into the response body
 * only, so on 2026-08-27 the single recoverable night said "unparseable" and
 * that fact would have expired the next morning. Sixty-four nights of evidence
 * about the loop had already been thrown away one day at a time.
 *
 * `logDebug` is the convention the other jobs already follow, and it is the
 * right sink because prune-debug-logs keeps `error` rows 90 days and info/warn
 * 30 — so the runs worth a postmortem are the ones that survive to have one.
 *
 * The discriminator is `requireCronAuth`, same as cron-schedule-coverage: a
 * route that demands cron auth is machine-driven, so no human sees its output
 * unless it is written down. That is a property of the code, not a list to
 * maintain, so it cannot rot.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const CRON_DIR = "src/app/api/crons";

/** Comments are stripped before every match below. A gate that reads its own
 *  explanatory comment passes while the code it describes is gone — that has
 *  happened three times in this repo, so it is now done once, up front. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const routes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => {
    const file = `${CRON_DIR}/${name}/route.ts`;
    return existsSync(file) && code(readFileSync(file, "utf8")).includes("requireCronAuth");
  })
  .sort();

// A scan that matches nothing passes every assertion below it and reports
// success. The floor is what makes a silent miss loud.
assert.ok(
  routes.length >= 15,
  `expected many cron-authed routes, found ${routes.length} — has the layout moved, or did the filter stop matching?`,
);

const silent: string[] = [];
const misnamed: { route: string; found: string }[] = [];

for (const name of routes) {
  const src = code(readFileSync(`${CRON_DIR}/${name}/route.ts`, "utf8"));

  // A CALL, not an import. `import { logDebug }` satisfies `.includes("logDebug")`
  // while the function is never invoked — the exact shape that let a check pass
  // against an import line earlier today.
  if (!/\blogDebug\s*\(/.test(src)) {
    silent.push(name);
    continue;
  }

  // The source string is how these rows are found again. A copy-pasted route
  // that logs under a sibling's name is worse than not logging: the rows exist,
  // and every query for this job returns nothing.
  const sources = [...src.matchAll(/source:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const expected = `crons/${name}`;
  if (sources.length && !sources.includes(expected)) {
    misnamed.push({ route: name, found: sources.join(", ") });
  }
}

assert.deepEqual(
  silent,
  [],
  `cron route(s) that persist NOTHING — their outcome lives only in a journal ` +
    `that holds about a day:\n  ${silent.join("\n  ")}\n` +
    `Add a logDebug({ source: "crons/<name>", level, message, meta }) call, with ` +
    `level reflecting the outcome so a failure is louder than a success.`,
);

assert.deepEqual(
  misnamed,
  [],
  `cron route(s) logging under the wrong source — their rows are unfindable:\n  ${misnamed
    .map((m) => `${m.route} logs as "${m.found}", expected "crons/${m.route}"`)
    .join("\n  ")}`,
);

console.log(
  `✓ cron outcome persistence: ${routes.length} cron-authed route(s), all recording their outcome under their own source`,
);
