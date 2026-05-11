/**
 * Prompt Library — SSOT for all prompt templates.
 * Categories map to development disciplines.
 * scope: "global" = runs across all projects, "project" = runs against one project
 * suggestedSchedule: cron expression if this makes sense as a recurring job
 */

export type PromptCategory =
  | "engineering"
  | "frontend"
  | "backend"
  | "database"
  | "devops"
  | "design"
  | "business"
  | "marketing"
  | "research"
  | "personal";

type PromptScope = "global" | "project";

export type PromptTemplate = {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  scope: PromptScope;
  template: string; // may contain {{project_name}} placeholder
  suggestedSchedule?: string; // cron expr, e.g. "0 9 * * 1"
  tags?: string[];
  featured?: boolean; // show in Quick Access row
};

export const CATEGORY_META: Record<PromptCategory, { label: string; color: string }> = {
  engineering:  { label: "Engineering",  color: "ui-cat-engineering" },
  frontend:     { label: "Frontend",     color: "ui-cat-frontend" },
  backend:      { label: "Backend",      color: "ui-cat-backend" },
  database:     { label: "Database",     color: "ui-cat-database" },
  devops:       { label: "DevOps",       color: "ui-cat-devops" },
  design:       { label: "Design",       color: "ui-cat-design" },
  business:     { label: "Business",     color: "ui-cat-business" },
  marketing:    { label: "Marketing",    color: "ui-cat-marketing" },
  research:     { label: "Research",     color: "ui-cat-research" },
  personal:     { label: "Personal",     color: "ui-cat-personal" },
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // ─── Engineering ──────────────────────────────────────────────────────────
  {
    id: "security-audit",
    name: "Security Audit",
    featured: true,
    description: "Scan for vulnerabilities, auth gaps, exposed secrets, injection risks",
    category: "engineering",
    scope: "project",
    template: `Run a security audit for the {{project_name}} project.

Check for:
1. Authentication and authorization gaps
2. Input validation issues (injection, XSS, CSRF)
3. Exposed secrets or credentials in code
4. Dependencies with known CVEs
5. API endpoints without proper validation

Report findings as: CRITICAL / HIGH / MEDIUM / LOW with recommended fixes.`,
    tags: ["security", "audit"],
  },
  {
    id: "code-quality-review",
    name: "Code Quality Review",
    description: "Review for DRY violations, complexity, dead code, naming issues",
    category: "engineering",
    scope: "project",
    template: `Review the {{project_name}} codebase for code quality.

Focus on:
1. DRY violations (repeated logic that should be extracted)
2. Functions/components over 100 lines
3. Dead code and unused imports
4. Naming clarity (variables, functions, files)
5. Missing error handling at system boundaries

List top 5 issues with file paths and specific fixes.`,
    suggestedSchedule: "0 10 * * 1",
    tags: ["quality", "refactor"],
  },
  {
    id: "tech-debt-scan",
    name: "Tech Debt Scanner",
    description: "Identify TODOs, FIXMEs, deprecated patterns, and architectural debt",
    category: "engineering",
    scope: "project",
    template: `Scan {{project_name}} for technical debt.

1. Find all TODO/FIXME/HACK comments with context
2. Identify deprecated dependencies or patterns
3. Flag any missing tests for critical business logic
4. List architectural shortcuts that will hurt later

Output: prioritized debt list with effort estimates (S/M/L).`,
    tags: ["debt", "maintenance"],
  },

  // ─── Frontend ──────────────────────────────────────────────────────────────
  {
    id: "ux-audit",
    name: "UX & Accessibility Audit",
    featured: true,
    description: "Check responsive design, touch targets, focus states, loading states",
    category: "frontend",
    scope: "project",
    template: `Audit the {{project_name}} frontend for UX and accessibility.

Check:
1. Mobile-first responsive design (all breakpoints)
2. Touch targets ≥ 44×44px on mobile
3. Focus states visible on all interactive elements
4. Loading, empty, and error states for all async operations
5. Color contrast ratios (WCAG AA minimum)
6. Missing alt text or semantic HTML

List violations with component/page location.`,
    tags: ["ux", "a11y", "responsive"],
  },
  {
    id: "performance-check",
    name: "Frontend Performance",
    description: "Bundle size, unnecessary re-renders, image optimization, lazy loading",
    category: "frontend",
    scope: "project",
    template: `Analyze {{project_name}} frontend performance.

Check:
1. Bundle size — any unnecessarily large imports?
2. Unnecessary re-renders in React components
3. Images — missing lazy loading, unoptimized formats
4. Fonts — render-blocking or unoptimized loading
5. Largest Contentful Paint blockers

Give specific optimization recommendations with estimated impact.`,
    tags: ["performance", "bundle"],
  },
  {
    id: "component-review",
    name: "Component Architecture Review",
    description: "Check component boundaries, prop drilling, state management patterns",
    category: "frontend",
    scope: "project",
    template: `Review {{project_name}} component architecture.

1. Identify god components (>300 lines) that need splitting
2. Find prop drilling deeper than 3 levels
3. Check separation of concerns (business logic in components?)
4. Ensure consistent patterns across similar components
5. Spot missing memoization for expensive computations

Output: component refactor priority list.`,
    tags: ["components", "architecture"],
  },

  // ─── Backend ───────────────────────────────────────────────────────────────
  {
    id: "api-review",
    name: "API Design Review",
    description: "Check REST conventions, input validation, error responses, auth",
    category: "backend",
    scope: "project",
    template: `Review {{project_name}} API design and implementation.

Audit:
1. RESTful conventions (methods, status codes, naming)
2. Input validation at every endpoint boundary
3. Consistent error response format
4. Authentication/authorization on all protected routes
5. Rate limiting where needed
6. Response shape consistency

List any violations with the endpoint and recommended fix.`,
    tags: ["api", "rest", "validation"],
  },
  {
    id: "error-handling-review",
    name: "Error Handling Audit",
    description: "Find unhandled promise rejections, missing try/catch, silent failures",
    category: "backend",
    scope: "project",
    template: `Audit error handling in {{project_name}}.

Find:
1. Unhandled promise rejections
2. Missing error boundaries in async flows
3. Errors swallowed silently (empty catch blocks)
4. User-facing technical error messages (should be friendly)
5. Missing logging for important errors

Provide specific file locations and fixes.`,
    tags: ["errors", "reliability"],
  },

  // ─── Database ──────────────────────────────────────────────────────────────
  {
    id: "query-optimization",
    name: "Query Performance Review",
    description: "Find N+1 queries, missing indexes, slow queries, and over-fetching",
    category: "database",
    scope: "project",
    template: `Review {{project_name}} database queries for performance issues.

Look for:
1. N+1 query patterns (loop + per-item query)
2. Missing indexes on frequently filtered columns
3. SELECT * where specific columns suffice
4. Queries that return more rows than needed (missing limits)
5. Missing pagination on list endpoints

List the top 5 query performance issues with SQL and fix.`,
    tags: ["performance", "sql", "indexes"],
  },
  {
    id: "schema-review",
    name: "Schema Health Check",
    description: "Review data model for normalization, missing constraints, data types",
    category: "database",
    scope: "project",
    template: `Audit the {{project_name}} database schema.

Check:
1. Proper normalization (no repeated data)
2. Missing NOT NULL constraints where data is always required
3. Foreign key integrity and cascade behavior
4. Appropriate data types (using text where varchar would be better, etc.)
5. Missing unique constraints for business-rule uniqueness
6. Tables without created_at/updated_at tracking

Output: schema improvement recommendations.`,
    tags: ["schema", "constraints", "modeling"],
  },

  // ─── DevOps ────────────────────────────────────────────────────────────────
  {
    id: "deployment-health",
    name: "Deployment Health Check",
    description: "Check CI status, environment config, secrets management, monitoring",
    category: "devops",
    scope: "project",
    template: `Check deployment health for {{project_name}}.

Verify:
1. CI/CD pipeline status (passing/failing?)
2. Environment variables — any missing in production?
3. Secrets management (no hardcoded creds in code)
4. Error monitoring set up?
5. Uptime/health endpoint exists?
6. Database backups configured?

Report: green / amber / red per area.`,
    suggestedSchedule: "0 9 * * 1",
    tags: ["ci", "deployment", "monitoring"],
  },

  // ─── Design ────────────────────────────────────────────────────────────────
  {
    id: "design-consistency",
    name: "Design Consistency Audit",
    description: "Check color usage, spacing, typography, component patterns across pages",
    category: "design",
    scope: "project",
    template: `Audit {{project_name}} for design consistency.

Look for:
1. Inconsistent color usage (hardcoded hex vs. design tokens)
2. Spacing irregularities (mixed margin/padding patterns)
3. Typography inconsistencies (font sizes, weights)
4. Different button/form styles across pages
5. Dark mode gaps (elements not adapting)

List violations by page/component.`,
    tags: ["design-system", "consistency"],
  },

  // ─── Business ──────────────────────────────────────────────────────────────
  {
    id: "feature-gap-analysis",
    name: "Feature Gap Analysis",
    featured: true,
    description: "Compare current features to goal milestones and find the critical gap",
    category: "business",
    scope: "project",
    template: `Analyze feature gaps for {{project_name}}.

1. List all shipped features
2. List features in the backlog or milestones
3. Identify the ONE feature that would most advance the project's primary goal
4. Estimate effort (S=<1day, M=1-3days, L=1week+)
5. What's the single highest-ROI next build?

Be specific and opinionated about what to build next.`,
    suggestedSchedule: "0 10 * * 1",
    tags: ["roadmap", "prioritization"],
  },
  {
    id: "user-story-writing",
    name: "Write User Stories",
    description: "Turn feature ideas into structured user stories with acceptance criteria",
    category: "business",
    scope: "project",
    template: `Write user stories for {{project_name}}'s next feature set.

For each story:
- As a [user type], I want [action] so that [benefit]
- Acceptance criteria (3-5 bullet points)
- Technical notes (any implementation constraints)

Focus on the highest-priority unbuilt features. Write 3-5 stories.`,
    tags: ["stories", "planning"],
  },
  {
    id: "project-status-summary",
    name: "Project Status Summary",
    description: "Current state, what's working, what's broken, what's next",
    category: "business",
    scope: "project",
    template: `Generate a project status summary for {{project_name}}.

Include:
1. **What's working** — shipped and functional features
2. **What's broken** — known issues or incomplete features
3. **Progress vs. goals** — how close to primary milestones?
4. **Next 3 actions** — most impactful things to do right now
5. **Blockers** — anything blocking progress?

Keep it under 300 words. Be direct.`,
    suggestedSchedule: "0 9 * * 1",
    tags: ["status", "reporting"],
  },

  // ─── Marketing ─────────────────────────────────────────────────────────────
  {
    id: "value-prop-clarity",
    name: "Value Proposition Review",
    description: "Is the product's value clear in 5 seconds? Landing page audit",
    category: "marketing",
    scope: "project",
    template: `Review {{project_name}}'s value proposition and landing page.

Evaluate:
1. Can a new visitor understand what this does in 5 seconds?
2. Is the primary CTA clear and compelling?
3. Does the hero section answer: who is this for, what does it do, why now?
4. Are benefits (not just features) front and center?
5. Social proof — testimonials, usage numbers, logos?

Rewrite the headline and subheadline if needed.`,
    tags: ["landing", "positioning", "copy"],
  },

  // ─── Research ──────────────────────────────────────────────────────────────
  {
    id: "competitor-analysis",
    name: "Competitor Analysis",
    description: "Compare to top 3 alternatives — features, pricing, positioning",
    category: "research",
    scope: "project",
    template: `Research {{project_name}}'s competitive landscape.

1. Identify top 3 alternatives users might choose instead
2. For each competitor: key features, pricing, target audience
3. What does {{project_name}} do better?
4. What do competitors do better (gaps to address)?
5. What's the unique angle that makes {{project_name}} win?

Be specific with examples from actual competitor products.`,
    tags: ["competition", "market"],
  },
  {
    id: "user-research-synthesis",
    name: "User Research Synthesis",
    description: "Synthesize feedback, find patterns, extract actionable insights",
    category: "research",
    scope: "project",
    template: `Synthesize user feedback for {{project_name}}.

1. Check memory for recent user feedback, messages, or conversations about {{project_name}}
2. Identify top 3 recurring pain points
3. Identify top 3 things users love
4. What feature request comes up most?
5. What would make users recommend it to a friend?

Format as: Pain points → Product improvements → Priority order.`,
    tags: ["feedback", "insights"],
  },

  // ─── DevOps (continued) ────────────────────────────────────────────────────
  {
    id: "commit-push-deploy",
    name: "Commit → Push → Deploy → Verify",
    featured: true,
    description: "Stage all changes, write commit message, push to GitHub, monitor Vercel deployment, run smoke tests",
    category: "devops",
    scope: "project",
    template: `Run the full commit → push → deploy → verify cycle for {{project_name}}.

Steps:
1. Check git status — what files changed?
2. Run lint and type check. If failures, stop and report.
3. Stage relevant files (not .env, not secrets)
4. Write a clear commit message (conventional commits: feat/fix/chore/refactor)
5. Commit and push to origin/main
6. If Vercel is connected, monitor deployment until Ready or Failed
7. If Failed: read error logs, identify root cause, report
8. If Ready: hit the production URL and verify the main flow works

Report: ✓ deployed at <url> or ✗ failed: <reason>`,
    tags: ["git", "deploy", "ci", "vercel"],
  },
  {
    id: "project-status",
    name: "Project Status Report",
    featured: true,
    description: "Full health check: git status, CI, Vercel, broken features, next action",
    category: "devops",
    scope: "project",
    template: `Generate a full status report for {{project_name}}.

Check:
1. **Git**: last commit, any uncommitted changes, branch status
2. **CI**: GitHub Actions status (passing/failing)
3. **Deployment**: Vercel status, last deploy date
4. **Known issues**: broken features, open bugs from Cockpit knowledge graph
5. **Next action**: single most important thing to do right now

Format as a quick-scan card. Green ✓ / Yellow ⚠ / Red ✗ per area.`,
    suggestedSchedule: "0 9 * * 1",
    tags: ["status", "ci", "deployment", "health"],
  },

  // ─── Personal / Global ─────────────────────────────────────────────────────
  {
    id: "weekly-build-review",
    name: "Weekly Build Review",
    description: "What shipped this week across all projects? What's next?",
    category: "personal",
    scope: "global",
    template: `Run a weekly build review across all active projects.

For each project:
1. What shipped this week (commits, features, fixes)?
2. What's the current status (on track / blocked / needs attention)?
3. What's the highest-priority next action?

Then: across all projects, what's the single most important thing to focus on next week?

Check git logs and Cockpit database for current state.`,
    suggestedSchedule: "0 18 * * 5",
    tags: ["weekly", "review"],
  },
  {
    id: "daily-dev-plan",
    name: "Daily Development Plan",
    featured: true,
    description: "Given everything in flight, what should be built today?",
    category: "personal",
    scope: "global",
    template: `Create today's development plan.

1. Check all active projects — what's in progress or blocked?
2. Look at open GitHub issues and failing CI across projects
3. Review any deadlines or commitments due soon
4. Pick the ONE project that needs attention most today
5. Outline 3 concrete tasks for that project

Be specific. No more than 150 words.`,
    suggestedSchedule: "0 8 * * 1-5",
    tags: ["planning", "daily"],
  },
];

export const ALL_CATEGORIES = Object.keys(CATEGORY_META) as PromptCategory[];

export const GLOBAL_PROMPTS = PROMPT_TEMPLATES.filter((t) => t.scope === "global");

export const QUICK_PROMPTS = PROMPT_TEMPLATES
  .filter((t) => t.featured && t.scope === "global")
  .concat(PROMPT_TEMPLATES.filter((t) => t.featured && t.scope === "project").slice(0, 4));

/** Featured prompts scoped to a specific project — shown in the control panel for one-click inject. */
export const FEATURED_PROJECT_PROMPTS = PROMPT_TEMPLATES.filter(
  (t) => t.featured && t.scope === "project",
);

/** Replace {{project_name}} placeholders in a template with the actual project name. */
export function substituteProjectName(template: string, projectName: string): string {
  return template.replace(/\{\{project_name\}\}/g, projectName);
}
