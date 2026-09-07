/**
 * The {{variable}} renderer, and the guarantee that ONE implementation serves
 * every surface.
 *
 * The bug this pins: `prompts.variables` and a correct renderer existed in
 * src/db/queries/prompts.ts, which imports `db` — so no client component could
 * call it. Four UI call sites each substituted `{{project_name}}` by hand and
 * nothing else. That is invisible in the built-in library (all 37 of its
 * placeholders are project_name) and wrong for user-owned prompts, which reach
 * the same modals via asTemplate() and may declare anything. A body with
 * {{ticket_id}} was dispatched — or scheduled forever — with braces intact.
 *
 * Run: npx tsx scripts/test/prompt-vars.ts
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parsePromptVariables,
  renderPromptBody,
  unresolvedVariables,
} from "../../src/lib/prompt-vars";
import { substituteProjectName } from "../../src/config/prompt-library";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  ✗ ${label}`);
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────
ok(parsePromptVariables("no vars here").length === 0, "a body with no placeholders declares none");
ok(
  parsePromptVariables("{{a}} then {{b}}")
    .map((v) => v.name)
    .join(",") === "a,b",
  "declares each variable once, in order",
);
ok(parsePromptVariables("{{a}} and {{a}} again").length === 1, "dedupes a repeated variable");
ok(
  parsePromptVariables("{{branch|main}}")[0].defaultValue === "main",
  "reads the declared default",
);
ok(
  parsePromptVariables("{{ spaced }}")[0].name === "spaced",
  "tolerates whitespace inside the braces",
);

// A /g regex kept at module scope carries lastIndex between calls; two calls in
// a row would then disagree. This is the shape of that bug, not a style point.
const twice = "{{a}} {{b}}";
ok(
  parsePromptVariables(twice).length === parsePromptVariables(twice).length &&
    parsePromptVariables(twice).length === 2,
  "repeated calls give the same answer (no shared regex lastIndex)",
);

// ── Rendering ────────────────────────────────────────────────────────────────
ok(
  renderPromptBody("hi {{name}}", { name: "Cato" }) === "hi Cato",
  "a supplied value is substituted",
);
ok(
  renderPromptBody("on {{branch|main}}", {}) === "on main",
  "an absent value falls back to the declared default",
);
ok(
  renderPromptBody("on {{branch|main}}", { branch: "dev" }) === "on dev",
  "a supplied value beats the default",
);
ok(
  renderPromptBody("fix {{ticket_id}}", {}) === "fix {{ticket_id}}",
  "an unfilled variable with no default STAYS VISIBLE rather than blanking",
);
ok(
  renderPromptBody("in {{ project_name }}", { project_name: "fleetcrown" }) === "in fleetcrown",
  "renders the spaced spelling — the old replaceAll shipped these braces",
);
ok(
  renderPromptBody("{{a}} {{b}}", { a: "1", b: "2" }) === "1 2",
  "substitutes every occurrence in one pass",
);

// ── unresolvedVariables drives the modal's warning ───────────────────────────
ok(
  unresolvedVariables("{{a}} {{b|d}} {{c}}", { a: "x" })
    .map((v) => v.name)
    .join(",") === "c",
  "unresolved = declared, no value, no default",
);

// ── The wrapper delegates, so there is one renderer and not two ──────────────
ok(
  substituteProjectName("in {{project_name}}", "fc") === "in fc",
  "substituteProjectName still does its original job",
);
ok(
  substituteProjectName("in {{ project_name }}", "fc") === "in fc",
  "…and now also the spaced spelling it used to miss",
);
ok(
  substituteProjectName("{{project_name}} on {{branch|main}}", "fc") === "fc on main",
  "…and applies other variables' defaults instead of ignoring them",
);

// ── No surface may keep a private copy of the substitution ───────────────────
// The regression that produced this file was four hand-rolled substitutions.
// Assert the UI calls the shared renderer instead of re-implementing it.
for (const rel of [
  "src/components/prompts/RunModal.tsx",
  "src/components/prompts/ScheduleModal.tsx",
]) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  ok(
    !/replaceAll\(\s*["'`]\{\{/.test(src) && !/replace\(\s*\/\\\{\\\{/.test(src),
    `${rel} does not hand-roll a {{var}} substitution`,
  );
  ok(/from "@\/lib\/prompt-vars"/.test(src), `${rel} imports the shared renderer`);
}

// db/queries/prompts.ts must not grow a second copy either — it re-exports.
const queries = readFileSync(join(ROOT, "src/db/queries/prompts.ts"), "utf8");
ok(
  /from "@\/lib\/prompt-vars"/.test(queries),
  "db/queries/prompts.ts re-exports the shared renderer rather than defining one",
);

// The built-in library's own placeholders must stay renderable by the shared
// parser — if someone adds {{foo}} to a template, the modals now handle it.
const lib = readFileSync(join(ROOT, "src/config/prompt-library.ts"), "utf8");
const libVars = new Set([...lib.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]));
ok(libVars.size > 0, `the library declares placeholders (${[...libVars].join(", ")})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
