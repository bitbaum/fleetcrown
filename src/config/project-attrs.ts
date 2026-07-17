/**
 * Canonical project attribute keys — SSOT for every list that enumerates,
 * groups, or filters project attrs (context editor groups, profile-apply
 * key list, dispatch-context driving fields, attention signals) and for
 * call sites that pass a key string to the attrs API.
 *
 * Direct typed property reads (`attrs.next_step`) are fine and need not go
 * through this object — it exists to kill *string drift across lists*, not
 * property access.
 */
export const PROJECT_ATTR = {
  // Context brief (agent-facing)
  MISSION: "mission",
  VISION: "vision",
  CUSTOMERS: "customers",
  PROBLEM: "problem",
  SOLUTION: "solution",
  STACK: "stack",
  ARCHITECTURE: "architecture",
  CONVENTIONS: "conventions",
  // Workflow / metadata
  STATUS: "status",
  MATURITY: "maturity",
  NEXT_STEP: "next_step",
  DEFINITION_OF_DONE: "definition_of_done",
  GOAL_MAX_TURNS: "goal_max_turns",
  DESCRIPTION: "description",
  OWNER: "owner",
  PRODUCTION_URL: "production_url",
  URL: "url",
  REPO: "repo",
  GITHUB_REPO: "github_repo",
  // Attention signals (flag a project as needing attention)
  SECURITY_VULNERABILITY: "security_vulnerability",
  BROKEN_FEATURES: "broken_features",
  DEPLOYMENT_ISSUE: "deployment_issue",
  // Business plan
  BUSINESS_PLAN: "business_plan",
  BUSINESS_ACTIONS: "business_actions",
  BUSINESS_PLAN_UPDATED_AT: "business_plan_updated_at",
  // Market lens (human-facing profile fields)
  CURRENT_ALTERNATIVES: "current_alternatives",
  COMPETITORS: "competitors",
  COMPLEMENTS_SUBSTITUTES: "complements_substitutes",
  PARTNERSHIPS: "partnerships",
  POTENTIAL_CUSTOMERS: "potential_customers",
  EXPANSION_IDEAS: "expansion_ideas",
} as const;

export type ProjectAttrKey = (typeof PROJECT_ATTR)[keyof typeof PROJECT_ATTR];
