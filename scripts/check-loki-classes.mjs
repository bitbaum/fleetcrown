/**
 * Every `ui-loki-*` class used in a component must exist in globals.css, and
 * every one defined there must still be used.
 *
 * This exists because a CSS mistake is invisible to every other check in this
 * repo: a component referencing a class that was renamed or deleted still
 * typechecks, still lints, still builds, and still renders — as unstyled
 * markup. The rebuild of this surface deleted three components and a dozen
 * rules; without a check, the leftovers are found by a human noticing something
 * looks wrong.
 *
 * Run: node scripts/check-loki-classes.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CLASS_RE = /ui-loki-[a-z0-9-]+/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(full)) out.push(full);
  }
  return out;
}

const css = readFileSync("src/app/globals.css", "utf8");
// Only a selector defines a class. A bare mention inside a comment does not.
const defined = new Set([...css.matchAll(/\.(ui-loki-[a-z0-9-]+)/g)].map((m) => m[1]));

const used = new Set();
for (const file of walk("src")) {
  for (const match of readFileSync(file, "utf8").matchAll(CLASS_RE)) used.add(match[0]);
}

const missing = [...used].filter((c) => !defined.has(c)).sort();
const orphaned = [...defined].filter((c) => !used.has(c)).sort();

if (missing.length) {
  console.error(`✗ used in a component but not defined in globals.css:\n  ${missing.join("\n  ")}`);
}
if (orphaned.length) {
  console.error(`✗ defined in globals.css but used nowhere:\n  ${orphaned.join("\n  ")}`);
}
if (missing.length || orphaned.length) process.exit(1);

console.log(`✓ ${defined.size} ui-loki-* classes: all defined, all used`);
