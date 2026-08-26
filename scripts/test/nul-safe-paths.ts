/**
 * No script captures NUL-separated output in a command substitution.
 * Run: npx tsx scripts/test/nul-safe-paths.ts
 *
 * The class this closes: `staged=$(git diff -z --name-only ...)` looks correct
 * and is not. Command substitution STRIPS NUL bytes, so every path collapses
 * into one string — "a/route.ts" + "b/route.ts" becomes "a/route.tsb/route.ts"
 * — and the `xargs -0` that follows then fails on a filename that never
 * existed. It works with ONE file and breaks at TWO, so it presents as a weird
 * one-off rather than a broken tool.
 *
 * Found 2026-08-26 in .husky/pre-commit, where it had been silently rejecting
 * every commit that touched two or more TypeScript files. The whole point of
 * `-z` is to survive hostile paths; routing it through `$(...)` throws away
 * that guarantee AND breaks the ordinary case.
 *
 * The fix is always the same shape: PIPE the -z producer straight into
 * `xargs -0`, and count with a separate non-`-z` call if you need emptiness.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = [".husky", "scripts"];

function shellFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      shellFiles(path, out);
      continue;
    }
    if (!entry.isFile()) continue;
    // Husky hooks have no extension; everything else we care about is .sh.
    if (entry.name.endsWith(".sh") || dir.includes(".husky")) {
      // Skip anything that is obviously not a script.
      if (statSync(path).size > 200_000) continue;
      out.push(path);
    }
  }
  return out;
}

const files = shellFiles(ROOTS[0]).concat(shellFiles(ROOTS[1]));
assert.ok(files.length > 5, `expected to find shell scripts to scan, found ${files.length}`);

// `X=$( ... -z ... )` or `X=`` ... -z ... `` on one line. Deliberately narrow:
// it only fires when -z output is CAPTURED, which is the broken shape. Piping
// into xargs -0 on the same line is the correct form and must not match.
const CAPTURE_Z = /(?:\w+=\$\(|\$\((?!\s*cat\b))[^)\n]*\s-z\b[^)\n]*\)/;

const offenders: string[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    const code = line.split("#")[0];
    if (!code.includes("-z")) return;
    if (!CAPTURE_Z.test(code)) return;
    offenders.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

assert.deepEqual(
  offenders,
  [],
  `NUL-separated output captured in a command substitution — the NULs are stripped, ` +
    `so every path is concatenated into one:\n  ${offenders.join("\n  ")}\n` +
    `Pipe the producer straight into \`xargs -0\` instead of assigning it.`,
);

// The hook that was actually broken must keep using the piped form. Named
// explicitly: the scan above passes trivially if the file is ever deleted or
// stops mentioning -z at all.
{
  // Comments stripped first: the hook DOCUMENTS the broken form as the thing
  // not to do, and a check that reads its own counter-example fires on the
  // explanation instead of the code.
  const hook = readFileSync(".husky/pre-commit", "utf8")
    .split("\n").map((l) => l.split("#")[0]).join("\n");
  assert.match(
    hook, /git diff --cached -z[^|\n]*\|\s*xargs -0/,
    ".husky/pre-commit no longer pipes its -z file list into xargs -0",
  );
  assert.doesNotMatch(
    hook, /staged=\$\(git diff/,
    ".husky/pre-commit went back to capturing the file list in a command substitution",
  );
}

console.log(`✓ nul-safe paths: ${files.length} script(s) scanned, no -z output captured in $( )`);
