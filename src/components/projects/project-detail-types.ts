import type { Milestone } from "@/db/schema/goals";
import type { DevLogEntry } from "@/db/schema/user-projects";
export type { DevLogEntry };

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
  source: string | null;
  attrs: Record<string, string>;
  relations: Array<{ type: string; strength: number | null; targetId: string; targetName: string; targetType: string }>;
  interactions: Array<{ channel: string; direction: string; summary: string | null; occurredAt: string }>;
  linkedJobs: LinkedJob[];
  linkedGoals: LinkedGoal[];
  devLog: DevLogEntry[];
};

export type Tab = "overview" | "prompts" | "goals";

// Keys shown as quick-links in header
export const LINK_ATTRS = ["production_url", "repo", "github_repo", "url"];
// Issue keys rendered as warning cards
export const ISSUE_ATTRS = ["broken_features", "security_vulnerability", "deployment_issue"];
// Keys with dedicated rendering (not shown in generic grid)
export const RESERVED = [...LINK_ATTRS, ...ISSUE_ATTRS, "status", "maturity", "description", "owner"];

/**
 * Resolve project quick-link attrs into ready-to-use href strings.
 * Single source of truth for which attrs feed each link plus the
 * "bare host → https://, bare slug → https://github.com/" prefixing.
 */
export function getProjectLinks(attrs: Record<string, string>): {
  prodUrl: string | null;
  repo: string | null;
} {
  const prod = attrs["production_url"] ?? attrs["url"];
  const repo = attrs["repo"] ?? attrs["github_repo"];
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
  { key: "next_step", label: "Next Step", placeholder: "Single most important next action" },
];

export const SUGGESTED_ATTR_LABELS: Record<string, string> =
  Object.fromEntries(SUGGESTED_ATTRS.map(({ key, label }) => [key, label]));

export const SUGGESTED_ATTR_PLACEHOLDERS: Record<string, string> =
  Object.fromEntries(SUGGESTED_ATTRS.map(({ key, placeholder }) => [key, placeholder]));

export const PROJECT_CHANNELS = ["work-session", "meeting", "ivy", "review", "deployment", "call", "other"] as const;
