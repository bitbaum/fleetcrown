// SSOT for the public /pricing page. The ONLY difference the code actually
// enforces between tiers is the project limit (see src/lib/plan.ts); the tier
// ladder here is built on that real gate plus team collaboration (org/team
// projects are real). Everything a single builder can do is available on every
// plan — so those capabilities live in PRICING_INCLUDED, not as fake per-tier
// feature gates. Prices are the master-plan anchors (docs/master-plan-2026-07.md
// §7.2); adjust freely — one edit here, no component changes.

import type { Plan } from "@/db/schema/users";
import { PLAN_LIMITS, isUnlimitedProjects } from "@/lib/plan";

export const PRICING_CURRENCY = "CHF";

// Paid plans bill annually (the checkout route wires the annual price id); the
// figure shown is the per-month equivalent. Stated plainly under the grid.
export const PRICING_BILLING_NOTE =
  "Prices are per month, billed annually. Start free — every plan runs on your own machine or box with your own agent keys, so you only pay FleetCrown for the captain layer.";

export type PricingPlan = {
  key: Plan;
  name: string;
  /** CHF per month (0 = free). Displayed with PRICING_CURRENCY. */
  priceMonthly: number;
  tagline: string;
  /** The tier's real differentiators — led by the enforced project limit. */
  highlights: string[];
  cta: string;
  featured?: boolean;
};

const projectLimitLabel = (plan: Plan): string =>
  isUnlimitedProjects(plan)
    ? "Unlimited projects"
    : `Up to ${PLAN_LIMITS.projects[plan]} projects`;

export const PRICING_PLANS: PricingPlan[] = [
  {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Command your first projects and see the whole fleet.",
    highlights: [
      projectLimitLabel("free"),
      "The full captain dashboard",
      "Bring your own runner + agent keys",
    ],
    cta: "Start free",
  },
  {
    key: "personal",
    name: "Personal",
    priceMonthly: 15,
    tagline: "For one builder running FleetCrown as a daily operating layer.",
    highlights: [
      projectLimitLabel("personal"),
      "Everything in Free",
      "Room for a real project portfolio",
    ],
    cta: "Choose Personal",
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 40,
    tagline: "For operators running many projects at once.",
    highlights: [
      projectLimitLabel("pro"),
      "Everything in Personal",
      "No ceiling as your fleet grows",
    ],
    cta: "Choose Pro",
    featured: true,
  },
  {
    key: "team",
    name: "Team",
    priceMonthly: 90,
    tagline: "Shared projects and fleet visibility for a studio.",
    highlights: [
      projectLimitLabel("team"),
      "Everything in Pro",
      "Shared projects, roles, and team visibility",
    ],
    cta: "Choose Team",
  },
];

// Available on EVERY plan (all shipped today) — the captain layer itself. Listed
// once, honestly, instead of scattered as per-tier gates the code doesn't apply.
export const PRICING_INCLUDED: string[] = [
  "One identity — Loki — over every agent (Claude, Grok, Codex, Cursor, OpenClaw)",
  "Live fleet dashboard: Control, Today, Projects, Activity",
  "Local-first execution on your laptop or your own always-on box",
  "Cross-model verification — a definition-of-done gate a single agent can't do",
  "Cross-project fleet memory, autopilot loops, and the prompt library",
  "Bring your own agent keys — your compute, your cost, your control",
];
