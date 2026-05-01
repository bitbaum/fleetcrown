export type DimensionPrompt = {
  label: string;
  prompt: string; // {name}, {path}, {mission}, {stack}, {url} are interpolated
};

export type Dimension = {
  id: string;
  label: string;
  icon: string;
  prompts: DimensionPrompt[];
};

export const DIMENSIONS: Dimension[] = [
  {
    id: "engineering",
    label: "Engineering",
    icon: "⚙",
    prompts: [
      {
        label: "Full audit",
        prompt: `You are working on {name} at {path}. Run a comprehensive engineering audit: check for TypeScript errors, lint violations, failing tests, SSOT/DRY violations, broken flows, dead code, and security issues. Build a priority list by user impact and execute the single highest-priority fix fully. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Test & fix",
        prompt: `You are working on {name} at {path}. Run all available tests and fix every failure. If tests pass, identify the highest-risk untested flow and add a test for it. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Refactor",
        prompt: `You are working on {name} at {path}. Do a focused refactor pass: eliminate duplication, enforce SSOT, simplify overgrown code, and improve naming. Do not add features. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Security check",
        prompt: `You are working on {name} at {path}. Audit the codebase for security issues: input validation at boundaries, SQL injection, XSS, secrets in code, insecure defaults, over-exposed APIs. Fix the highest-severity finding. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
  {
    id: "product",
    label: "Product",
    icon: "📦",
    prompts: [
      {
        label: "Feature review",
        prompt: `You are reviewing {name} as a product owner. Mission: {mission}. Evaluate the current feature set against that mission. What is the highest-leverage feature gap? Implement the simplest version of it. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "User flows",
        prompt: `You are reviewing {name} at {path}. Walk through every primary user flow end-to-end. Identify where users hit friction, confusion, or dead ends. Fix the worst one. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Roadmap check",
        prompt: `You are reviewing {name}. Mission: {mission}. Look at the existing codebase, session state, and any TODO/FIXME markers. What are the three most important next product milestones? Which can be partially completed right now? Do it. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
  {
    id: "ux",
    label: "UX / Design",
    icon: "🎨",
    prompts: [
      {
        label: "UX review",
        prompt: `You are reviewing the UX of {name} at {path}. Check mobile responsiveness, touch targets (min 44px), visual hierarchy, empty/loading/error states, typography legibility, and accessibility basics. Fix the top two issues. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Mobile pass",
        prompt: `You are reviewing {name} specifically on mobile. Open every major page and check for: horizontal overflow, tiny tap targets, unreadable text, forms that are hard to use, and navigation that breaks on small screens. Fix everything you find. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Copy & clarity",
        prompt: `You are reviewing the copy and clarity of {name}. Check all headings, CTAs, empty states, error messages, and onboarding text. Are they clear to a non-technical user? Rewrite anything confusing. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "📣",
    prompts: [
      {
        label: "Positioning",
        prompt: `You are reviewing the marketing positioning of {name}. Mission: {mission}. URL: {url}. Evaluate the current homepage messaging: is the value proposition clear in 5 seconds? Who is the target user and is that obvious? Rewrite the hero section copy to be sharper. Leave notes on what you changed and why.`,
      },
      {
        label: "Landing page",
        prompt: `You are improving the landing page of {name}. URL: {url}. Review the page structure: headline, subheadline, features, social proof, CTA. Identify the weakest section and rewrite it. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "SEO basics",
        prompt: `You are auditing {name} at {path} for basic SEO. Check: meta titles and descriptions on every page, semantic HTML structure (h1/h2 hierarchy), image alt text, page load speed, and canonical URLs. Fix the most impactful gaps. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    icon: "✍",
    prompts: [
      {
        label: "Documentation",
        prompt: `You are improving the documentation of {name} at {path}. Check the README, inline comments, API docs, and any user-facing help text. What is missing that a new user would need? Write the most important missing section. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Onboarding",
        prompt: `You are reviewing the onboarding experience of {name}. A brand new user just signed up. Walk through the first 5 minutes: what do they see, what do they do, where do they get lost? Fix the biggest friction point. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Error messages",
        prompt: `You are reviewing error messages and empty states in {name} at {path}. Find every error boundary, 404 page, empty list, and API failure message. Rewrite them to be human, specific, and actionable. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "💼",
    prompts: [
      {
        label: "Monetization",
        prompt: `You are reviewing the business model of {name}. Mission: {mission}. Evaluate the current monetization approach: is there one? Is it clear on the product? What is the most direct path to revenue? Implement or improve one concrete monetization touchpoint. Leave notes on your reasoning.`,
      },
      {
        label: "Metrics",
        prompt: `You are reviewing {name} at {path}. What key business metrics should be tracked (signups, activation, retention, revenue, churn)? Are any of these currently being measured? Implement tracking for the single most important missing metric. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Competitive position",
        prompt: `You are reviewing {name}. Mission: {mission}. Research the top 3 competitors in this space. What do they do better? What does {name} do better or differently? Identify the single most defensible differentiator and make sure it is prominent in the product. Leave notes.`,
      },
    ],
  },
  {
    id: "deploy",
    label: "Deploy",
    icon: "🚀",
    prompts: [
      {
        label: "Pre-deploy check",
        prompt: `You are running a pre-deploy check for {name} at {path}. Verify: TypeScript compiles clean, tests pass, lint is clean, no secrets in code, build succeeds, critical flows work, environment variables are documented. Fix any blocker. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Commit & push",
        prompt: `You are shipping the current work in {name} at {path}. Review all uncommitted changes, verify nothing is broken, write a clear conventional commit message explaining why, commit, and push. Report what shipped. Leave a done/next/tests/todos/health handoff.`,
      },
      {
        label: "Health check",
        prompt: `You are checking the production health of {name}. URL: {url}. Verify the live site loads, critical pages return 200, no console errors on key pages, forms work, and auth flows succeed. Report findings and fix anything that can be fixed from code. Leave a done/next/tests/todos/health handoff.`,
      },
    ],
  },
];

export function interpolateDimensionPrompt(
  template: string,
  ctx: { name: string; path: string; mission?: string; stack?: string; url?: string },
): string {
  return template
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{path\}/g, ctx.path)
    .replace(/\{mission\}/g, ctx.mission ?? "not specified")
    .replace(/\{stack\}/g, ctx.stack ?? "not specified")
    .replace(/\{url\}/g, ctx.url ?? "not deployed yet");
}
