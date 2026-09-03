// A user of FleetCrown must be able to report a bug in FleetCrown.
//
// The widget was scoped to eleven public marketing routes, on the stated
// grounds that "in-app feedback already has Loki". That was not true:
// insertSiteFeedback has exactly one caller — the widget's ingest route — and
// Loki has no feedback capability at all. So every signed-in user, on every
// app page, had no structured way to report anything. The omission was
// invisible, which is the failure mode this whole product exists to fix.
//
// The rule is now an exclusion list, so a NEW page ships with feedback by
// default instead of silently shipping without it. This test pins that
// direction: the app surfaces must be covered, the excluded ones must stay
// excluded, and Loki must not be cited as the in-app answer while it cannot
// file anything.
// Run: npx tsx scripts/test/feedback-widget-reach.ts
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  isFeedbackWidgetRoute,
  FEEDBACK_WIDGET_EXCLUDED_PREFIXES,
} from "../../src/config/feedback-widget";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`✗ ${label}`);
  }
}

// The surfaces a signed-in operator actually works on. Each of these is a
// place someone can hit a bug, so each must be able to report one.
const APP_SURFACES = [
  "/today",
  "/control",
  "/projects",
  "/projects/5c0ea00f-d098-49a0-aae5-c83b8f4be79c",
  "/feedback",
  "/activity",
  "/goals",
  "/people",
  "/crew",
  "/money",
  "/habits",
  "/prompts",
  "/system",
  "/settings",
  "/loki",
  "/approvals",
];
for (const path of APP_SURFACES) {
  ok(isFeedbackWidgetRoute(path), `widget reaches ${path}`);
}

// Public pages keep it too — that was never in question, but a rewrite of the
// matcher could easily drop them.
for (const path of ["/", "/pricing", "/thoughts", "/thoughts/some-essay"]) {
  ok(isFeedbackWidgetRoute(path), `widget still reaches public ${path}`);
}

// The exclusions must actually exclude, including nested paths.
for (const p of FEEDBACK_WIDGET_EXCLUDED_PREFIXES) {
  ok(!isFeedbackWidgetRoute(p), `excluded: ${p}`);
  ok(!isFeedbackWidgetRoute(`${p}/nested`), `excluded: ${p}/nested`);
}

// A near-miss must NOT be excluded — prefix matching that swallows unrelated
// routes is how an allowlist quietly loses pages.
ok(isFeedbackWidgetRoute("/terminals"), "/terminals is not caught by the /terminal exclusion");
ok(isFeedbackWidgetRoute("/settings"), "/settings is an app page, not an auth page");

// The claim that justified the old scoping must not silently return. If Loki
// ever does gain the ability to file feedback, this test should be revisited
// deliberately rather than the assumption creeping back.
const loki = readFileSync(join(ROOT, "src/lib/loki-core.ts"), "utf8");
ok(
  !/insertSiteFeedback/.test(loki),
  "loki-core still cannot file feedback — the reason the widget must reach the app",
);

// The widget mounts from the ROOT layout, so coverage is not per-page opt-in.
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
ok(
  /DogfoodFeedbackWidget/.test(layout),
  "the widget is mounted in the root layout, so new pages get it for free",
);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
