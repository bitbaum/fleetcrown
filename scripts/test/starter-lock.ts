// The nextjs-tailwind starter must be deployable on its first push through
// selfhost-deploy.yml, which (1) refuses to install without a lockfile,
// (2) installs with --frozen-lockfile, (3) resolves the toolchain from
// package.json#packageManager, and (4) needs Next's standalone output.
// A starter that drifts from any of these ships a repo whose first Deploy
// fails — the dogfood site's exact failure. Run: npx tsx scripts/test/starter-lock.ts
import assert from "node:assert/strict";
import { renderTemplate, TEMPLATES } from "@/lib/project-templates";
import { STARTER_LOCK_FILE, STARTER_LOCK_TEMPLATE } from "@/lib/starter-locks/config";

const starter = TEMPLATES[STARTER_LOCK_TEMPLATE];
const values = {
  name: 'Zoë\'s "Bäckerei" `x` ${y}',
  description: 'with "quotes" and ${templates}',
};
const rendered = Object.fromEntries(
  Object.entries(starter.files).map(([p, body]) => [p, renderTemplate(body, values)]),
);

const lock = rendered[STARTER_LOCK_FILE];
assert.ok(lock && lock.length > 1000, "starter ships a resolved pnpm lockfile");
assert.equal(lock, starter.files[STARTER_LOCK_FILE], "rendering never touches the lockfile");
assert.match(lock, /^lockfileVersion: '9\.0'$/m, "pnpm 9+ lockfile format");

const pkg = JSON.parse(rendered["package.json"]) as {
  name: string;
  packageManager?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
assert.match(
  pkg.packageManager ?? "",
  /^pnpm@\d+\.\d+\.\d+$/,
  "declares the pnpm toolchain corepack should use",
);
assert.equal(
  pkg.name,
  "zo-s-b-ckerei-x-y",
  "package name is a valid slug even for a hostile project name",
);

// Every declared dependency must appear in the lock with the same specifier —
// that is what --frozen-lockfile checks before it refuses to install.
for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    lock,
    // pnpm quotes scoped names ('@types/node':) in YAML.
    new RegExp(`^      '?${esc(name)}'?:\\n        specifier: ${esc(spec)}$`, "m"),
    `lockfile resolves ${name}@${spec} — run scripts/templates/refresh-starter-lock.ts`,
  );
}

assert.match(
  rendered["next.config.ts"],
  /output:\s*"standalone"/,
  "deploy.sh requires standalone output",
);
assert.doesNotMatch(rendered["package.json"], /next lint/, "next lint was removed in Next 16");
// The rendered TSX/metadata must survive quotes, backticks and ${} in the brief.
assert.match(rendered["src/app/layout.tsx"], /title: "Zoë's \\"Bäckerei\\" `x` \$\{y\}"/);
assert.match(rendered["src/app/page.tsx"], /\{ "Zoë's \\"Bäckerei\\" `x` \$\{y\}" \}/);
// Docs inside the starter must not tell the agent to use a different manager
// than the one the lockfile was resolved for.
for (const text of [rendered["README.md"], starter.firstTask, ...starter.infra]) {
  assert.doesNotMatch(text, /\bnpm (install|run|ci)\b/, "starter docs point at pnpm, not npm");
}

console.log("✓ starter-lock tests passed");
