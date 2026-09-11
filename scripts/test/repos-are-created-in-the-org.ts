// Every repository FleetCrown creates lives in the organisation, never on the
// signed-in person's account. Five sites created on 2026-09-10/11 landed under
// `catomean` because the hosted path called POST /user/repos and the bootstrap
// route preferred the GitHub user over the org. This fails on:
//   - the constant not defaulting to the org,
//   - any creation call that does not go through the constant
//     (POST /user/repos, or `gh repo create <anything but the constant>/…`),
//   - a literal personal owner anywhere in src/ or scripts/hetzner/.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GITHUB_REPO_OWNER, repoUrlFor } from "../../src/config/github-owner";

assert.equal(GITHUB_REPO_OWNER, "bitbaum", "the default owner is the org");
assert.equal(repoUrlFor("annushka"), "https://github.com/bitbaum/annushka");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|sh)$/.test(name)) out.push(full);
  }
  return out;
}

const root = process.cwd();
const files = [...walk(join(root, "src")), ...walk(join(root, "scripts"))].filter(
  (f) => !f.endsWith("repos-are-created-in-the-org.ts"),
);
const offenders: string[] = [];
for (const file of files) {
  // Code only: a comment that NAMES the forbidden call must not trip the gate
  // (the explanation of why the gate exists is exactly such a comment).
  const src = readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const rel = file.slice(root.length + 1);
  // creation under the authenticated user
  if (
    /\/user\/repos[`"'?]/.test(src) &&
    /method:\s*["']POST["']/.test(src) &&
    !/affiliation=owner/.test(src)
  ) {
    offenders.push(`${rel}: POST /user/repos creates under the person`);
  }
  // gh repo create with an owner that is not the constant
  for (const m of src.matchAll(/gh repo create ['"]?\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?\//g)) {
    if (!["GITHUB_REPO_OWNER", "GH_OWNER"].includes(m[1]))
      offenders.push(`${rel}: gh repo create under ${m[1]}`);
  }
  // a personal owner literal
  if (/github\.com\/catomean\//.test(src) && !/test\//.test(rel)) {
    offenders.push(`${rel}: literal github.com/catomean/`);
  }
}
assert.deepEqual(
  offenders,
  [],
  "repositories must be created in the org:\n" + offenders.join("\n"),
);
console.log(`repos-are-created-in-the-org: ok (${files.length} files, owner ${GITHUB_REPO_OWNER})`);
