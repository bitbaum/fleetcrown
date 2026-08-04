// Verifies the cold-start plan (src/lib/project-kickoff.ts) and the starter
// inference that lets kickoff provision a repo without asking
// (src/config/project-templates.ts).
//
// The plan is the contract between the hero's button and the check that decides
// whether the hero renders — if those two disagree, a project either shows a
// button that does nothing or hides the only control that would start it.
// Run: npx tsx scripts/test/project-kickoff.ts
import {
  missingKickoffSetup,
  needsKickoff,
  planKickoff,
  hasKickoffSource,
} from "@/lib/project-kickoff";
import {
  DEFAULT_PROVISION_TEMPLATE,
  PROVISION_TEMPLATES,
  PROVISION_TEMPLATE_IDS,
  inferProvisionTemplate,
} from "@/config/project-templates";
import { TEMPLATES } from "@/lib/project-templates";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`✗ ${label}: expected ${e}, got ${a}`); }
}

// ── The plan ────────────────────────────────────────────────────────────────

const COLD = { attrs: {} as Record<string, string>, goalCount: 0, hasRepo: false };
const FULL_ATTRS = { mission: "m", problem: "p", solution: "s", stack: "Next.js" };

eq(missingKickoffSetup(COLD), ["profile", "milestones", "repo"], "an idea needs all three setup steps");
eq(planKickoff({ ...COLD, wantRepo: true }), ["profile", "milestones", "repo", "dispatch"], "full plan ends in dispatch");
eq(
  planKickoff({ ...COLD, wantRepo: false }),
  ["profile", "milestones", "dispatch"],
  "declining the repo drops only that step — the agent still gets dispatched",
);
eq(
  missingKickoffSetup({ attrs: FULL_ATTRS, goalCount: 5, hasRepo: true }),
  [],
  "a set-up project needs no setup steps",
);
eq(
  planKickoff({ attrs: FULL_ATTRS, goalCount: 5, hasRepo: true, wantRepo: true }),
  ["dispatch"],
  "dispatch is unconditional — kickoff never just tidies the profile",
);
eq(
  missingKickoffSetup({ attrs: { ...FULL_ATTRS, stack: "   " }, goalCount: 5, hasRepo: true }),
  ["profile"],
  "a whitespace-only core field counts as missing",
);
eq(
  missingKickoffSetup({ attrs: { ...FULL_ATTRS, vision: "" }, goalCount: 1, hasRepo: true }),
  [],
  "vision is not a core field — nice-to-have fields must not gate a start",
);

// ── Whether the hero renders at all ─────────────────────────────────────────

eq(needsKickoff({ ...COLD, agentRunning: false }), true, "cold project shows the hero");
eq(needsKickoff({ ...COLD, agentRunning: true }), false, "a live agent means it is already happening");
eq(
  needsKickoff({ attrs: FULL_ATTRS, goalCount: 3, hasRepo: true, agentRunning: false }),
  false,
  "a fully set-up project is served by Run next step, not the hero",
);
// The contract: whenever the hero renders, its plan does more than dispatch.
for (const setup of [
  COLD,
  { attrs: FULL_ATTRS, goalCount: 0, hasRepo: true },
  { attrs: FULL_ATTRS, goalCount: 2, hasRepo: false },
]) {
  const shown = needsKickoff({ ...setup, agentRunning: false });
  const plan = planKickoff({ ...setup, wantRepo: true });
  eq(shown && plan.length > 1, true, `hero shown ⇒ real work planned (${JSON.stringify(plan)})`);
}

eq(hasKickoffSource("too short"), false, "9 chars is below the brief route's floor");
eq(hasKickoffSource("a hiding box"), true, "a sentence is enough of a brief");
eq(hasKickoffSource(null), false, "no description is no source");
eq(hasKickoffSource("            "), false, "whitespace is no source");

// ── Starter inference ───────────────────────────────────────────────────────

eq(inferProvisionTemplate(null), DEFAULT_PROVISION_TEMPLATE, "no stack falls back to the default");
eq(inferProvisionTemplate("  "), DEFAULT_PROVISION_TEMPLATE, "blank stack falls back to the default");
eq(inferProvisionTemplate("Rust, Actix"), DEFAULT_PROVISION_TEMPLATE, "an unknown stack falls back, never throws");
eq(inferProvisionTemplate("Next.js 15, Tailwind, Postgres"), "nextjs-tailwind", "web stack");
eq(inferProvisionTemplate("Python + FastAPI, Postgres"), "python-fastapi", "python stack");
eq(inferProvisionTemplate("Hono on Cloudflare Workers"), "hono-cloudflare", "edge stack");
eq(inferProvisionTemplate("A plain html landing page"), "html-tailwind", "static stack");
// Scoring, not first-match: a Python API with a React dashboard is a Python repo.
eq(
  inferProvisionTemplate("Python, FastAPI, uvicorn, with a React dashboard"),
  "python-fastapi",
  "the stack with more matches wins over the one listed first",
);
eq(inferProvisionTemplate("NEXTJS AND TAILWIND"), "nextjs-tailwind", "matching is case-insensitive");

// ── The template list is genuinely one list ─────────────────────────────────

eq(
  PROVISION_TEMPLATE_IDS.length,
  PROVISION_TEMPLATES.length,
  "the zod tuple covers every template",
);
eq(
  PROVISION_TEMPLATES.every((t) => TEMPLATES[t.id]?.label === t.label),
  true,
  "the seeded registry takes its labels from the config — no second list to drift",
);
eq(
  Object.keys(TEMPLATES).length,
  PROVISION_TEMPLATES.length,
  "every configured template is seedable",
);
eq(
  PROVISION_TEMPLATES.every((t) => t.id === "bare" || Object.keys(TEMPLATES[t.id].files).length > 0),
  true,
  "every non-bare starter seeds files",
);

console.log(`${fail === 0 ? "✓" : "✗"} project-kickoff: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
