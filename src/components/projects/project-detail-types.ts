import type { Milestone } from "@/db/schema/goals";
import type { DevLogEntry, ProjectResource } from "@/db/schema/user-projects";
import type { ProjectActivityEvent } from "@/db/queries/activity";
export type { DevLogEntry, ProjectResource };
// The project profile's activity feed is the unified activity read-model SSOT
// (prompts + run outcomes + lifecycle), the same type the /control panel uses.
export type { ProjectActivityEvent };

// ─── Health Signal Config (base — no Lucide icons, safe to import anywhere) ──

export type HealthSignalKind = "security" | "broken" | "deployment";

export type HealthSignalBase = {
  kind: HealthSignalKind;
  key: string;
  label: string;
  cardLabel: string;
  badgeCls: string;
  cardBorder: string;
  cardBg: string;
  cardText: string;
  cardBody: string;
};

/** Single source of truth for health signal metadata. Icons are added in project-badges.tsx. */
export const HEALTH_SIGNAL_BASE: HealthSignalBase[] = [
  {
    kind: "security", key: "security_vulnerability",
    label: "Security risk", cardLabel: "Security Risk",
    badgeCls: "bg-status-negative-subtle text-status-negative border-status-negative/25",
    cardBorder: "border-status-negative/25", cardBg: "bg-status-negative-subtle",
    cardText: "text-status-negative", cardBody: "text-status-negative/70",
  },
  {
    kind: "broken", key: "broken_features",
    label: "Broken", cardLabel: "Broken Features",
    badgeCls: "bg-status-warning-subtle text-status-warning border-status-warning/25",
    cardBorder: "border-status-warning/25", cardBg: "bg-status-warning-subtle",
    cardText: "text-status-warning", cardBody: "text-status-warning/70",
  },
  {
    kind: "deployment", key: "deployment_issue",
    label: "Deploy issue", cardLabel: "Deployment Issue",
    badgeCls: "bg-status-warning-subtle text-status-warning border-status-warning/25",
    cardBorder: "border-status-warning/25", cardBg: "bg-status-warning-subtle",
    cardText: "text-status-warning", cardBody: "text-status-warning/70",
  },
];

export type LinkedGoal = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  progress: number | null;
  targetDate: string | null;
  milestones: Milestone[] | null;
};

export type LinkedJob = {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  schedule: string;
  lastStatus?: string;
  consecutiveErrors?: number;
};

export type ProjectData = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  gitUrl: string | null;
  dirPath: string | null;
  source: string | null;
  createdAt: string | null;
  readonly?: boolean;
  attrs: Record<string, string>;
  relations: Array<{ type: string; strength: number | null; targetId: string; targetName: string; targetType: string }>;
  interactions: Array<{ channel: string; direction: string; summary: string | null; occurredAt: string }>;
  linkedJobs: LinkedJob[];
  linkedGoals: LinkedGoal[];
  resources: ProjectResource[];
  notes: string | null;
  devLog: DevLogEntry[];
  activity: ProjectActivityEvent[];
  runtimeState: ProjectRuntimeState | null;
};

export type ProjectRuntimeState = {
  tabName: string;
  readyAt: string | null;
  closingAt: string | null;
  closedAt: string | null;
  currentPromptLabel: string | null;
  currentPromptStartedAt: string | null;
  sessionUpdatedAt: string | null;
};

export type Tab = "overview" | "prompts" | "goals";

// Keys shown as quick-links in header
export const LINK_ATTRS = ["production_url", "repo", "github_repo", "url"];
// Build contract — injected into every dispatch (project-context DRIVING_FIELDS)
export const BUILD_ATTRS = ["architecture", "conventions", "definition_of_done"] as const;
export const BUILD_ATTR_LABELS: Record<(typeof BUILD_ATTRS)[number], string> = {
  architecture: "Architecture",
  conventions: "Conventions",
  definition_of_done: "Definition of done",
};
export const BUILD_ATTR_PLACEHOLDERS: Record<(typeof BUILD_ATTRS)[number], string> = {
  architecture: "Main modules, data stores, integrations",
  conventions: "Patterns and rules engineers must follow",
  definition_of_done: "Bar a change must clear — tsc, lint, tests, deploy",
};
// Derived from HEALTH_SIGNAL_BASE — never list these manually again
export const ISSUE_ATTRS = HEALTH_SIGNAL_BASE.map((s) => s.key);
// Business-plan keys rendered by BusinessPlanSection (kept here, not imported
// from the component, to avoid a config→component dependency)
export const BUSINESS_ATTRS = [
  "business_plan", "business_actions", "business_plan_updated_at",
  "problem", "solution", "current_alternatives", "competitors",
  "complements_substitutes", "partnerships", "potential_customers", "expansion_ideas",
];
// Keys with dedicated rendering (not shown in generic grid)
export const RESERVED = [...LINK_ATTRS, ...ISSUE_ATTRS, ...BUSINESS_ATTRS, ...BUILD_ATTRS, "status", "maturity", "description", "owner", "next_step"];

/**
 * Resolve project quick-link attrs into ready-to-use href strings.
 * Single source of truth for which attrs feed each link plus the
 * "bare host → https://, bare slug → https://github.com/" prefixing.
 *
 * `gitUrl` is the first-class entities.git_url column populated by the
 * GitHub-import + cloud-bootstrap flows (introduced 2026-06-05). It
 * overrides legacy `attrs.repo` when both are set — entity column wins.
 */
export function getProjectLinks(
  attrs: Record<string, string>,
  gitUrl?: string | null,
): {
  prodUrl: string | null;
  repo: string | null;
} {
  const prod = attrs["production_url"] ?? attrs["url"];
  const attrRepo = attrs["repo"] ?? attrs["github_repo"];
  const repo = gitUrl || attrRepo;
  return {
    prodUrl: prod ? (prod.startsWith("http") ? prod : `https://${prod}`) : null,
    repo:    repo ? (repo.startsWith("http") ? repo : `https://github.com/${repo}`) : null,
  };
}

export const SUGGESTED_ATTRS: { key: string; label: string; placeholder: string }[] = [
  { key: "mission",   label: "Mission",   placeholder: "Why this project exists" },
  { key: "vision",    label: "Vision",    placeholder: "Where it's going in 3 years" },
  { key: "customers", label: "Customers", placeholder: "Who uses this and why" },
  { key: "stack",     label: "Stack",     placeholder: "Tech stack used" },
  // next_step intentionally omitted — rendered by NextStepSection with dedicated UX
];

export const SUGGESTED_ATTR_LABELS: Record<string, string> =
  Object.fromEntries(SUGGESTED_ATTRS.map(({ key, label }) => [key, label]));

export const SUGGESTED_ATTR_PLACEHOLDERS: Record<string, string> =
  Object.fromEntries(SUGGESTED_ATTRS.map(({ key, placeholder }) => [key, placeholder]));

export type ChannelConfig = { key: string; label: string };

/** Single source of truth for activity channels. Icons live in ProjectOverviewTab (UI concern). */
export const CHANNEL_CONFIG: ChannelConfig[] = [
  { key: "work-session", label: "Work Session" },
  { key: "meeting",      label: "Meeting" },
  { key: "ivy",          label: "Loki" }, // key kept for DB compat
  { key: "review",       label: "Review" },
  { key: "deployment",   label: "Deployment" },
  { key: "call",         label: "Call" },
  { key: "other",        label: "Other" },
];

export const PROJECT_CHANNELS = CHANNEL_CONFIG.map((c) => c.key) as [string, ...string[]];
