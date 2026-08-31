/**
 * The env checker resolves each variable the same way its consumer does.
 * Run: npx tsx scripts/test/env-check-resolution.ts
 *
 * The class this closes: a guard that reads a DIFFERENT environment variable
 * than the code it guards. It is wrong in both directions at once, which is why
 * it survives — the false alarm trains you to ignore it, and the false quiet is
 * the state you actually needed to hear about.
 *
 * Found 2026-08-27. `checkEnv()` warned on the bare `TELEGRAM_CHAT_ID`, while
 * every consumer reads it through `envAlias`, which looks ONLY at APP_ /
 * FLEETCROWN_ / COCKPIT_ prefixes and never the bare name. In production
 * APP_TELEGRAM_CHAT_ID was set and delivery worked (confirmed live with a
 * read-only getChat) — so the warning fired at every boot for nothing, 48 of
 * that week's 231 warnings, on a surface carrying six real errors underneath.
 *
 * The dangerous half is the other one: the message told the operator to set
 * `TELEGRAM_CHAT_ID`, which would have silenced the warning while
 * selfTelegramTarget() still returned null and every notification still
 * vanished. A fix that removes the signal and not the fault is worse than no
 * check at all.
 *
 * The rule is derived from the source, not from a list here: whatever the app
 * resolves through envAlias, the checker must resolve through envAlias too.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE = "src/lib/env.ts";

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      tsFiles(path, out);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && statSync(path).size < 500_000) {
      out.push(path);
    }
  }
  return out;
}

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

// ── Keys the APP resolves through envAlias ───────────────────────────────────
const aliasResolved = new Set<string>();
for (const file of tsFiles("src")) {
  for (const m of code(readFileSync(file, "utf8")).matchAll(
    /envAlias\(\s*["'`]([A-Z0-9_]+)["'`]/g,
  )) {
    aliasResolved.add(m[1]);
  }
}
assert.ok(
  aliasResolved.size >= 3,
  `found only ${aliasResolved.size} envAlias-resolved key(s) — the scan is not matching; ` +
    `a blinded scan would pass every assertion below it`,
);

// ── Keys the CHECKER resolves bare, off process.env ──────────────────────────
const envSrc = code(readFileSync(ENV_FILE, "utf8"));

const bareChecked = new Set<string>();
for (const m of envSrc.matchAll(/\b(?:present|val)\(\s*["'`]([A-Z0-9_]+)["'`]\s*\)/g)) {
  bareChecked.add(m[1]);
}
// The SECRETS array is walked with the bare `val(k)` accessor in a loop, so
// every name in it is bare-checked too even though it never appears in a call.
const secretsBlock = envSrc.match(/const SECRETS\s*=\s*\[([\s\S]*?)\]/);
if (secretsBlock) {
  for (const m of secretsBlock[1].matchAll(/["'`]([A-Z0-9_]+)["'`]/g)) bareChecked.add(m[1]);
}
assert.ok(
  bareChecked.size >= 5,
  `parsed only ${bareChecked.size} bare-checked key(s) from ${ENV_FILE} — the accessors were renamed`,
);

// ── The rule ─────────────────────────────────────────────────────────────────
const mismatched = [...aliasResolved].filter((k) => bareChecked.has(k)).sort();

assert.deepEqual(
  mismatched,
  [],
  `${ENV_FILE} checks key(s) on the BARE name that the app reads through envAlias:\n  ${mismatched.join("\n  ")}\n` +
    `The check is then wrong in both directions: it warns when the prefixed name IS set, ` +
    `and goes quiet when someone sets the bare name it names in its own message.\n` +
    `Use the aliased accessor for these, and make the message name the prefixed variable.`,
);

console.log(
  `✓ env check resolution: ${aliasResolved.size} envAlias-resolved key(s), none checked on the bare name`,
);
