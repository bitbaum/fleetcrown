/**
 * Derived project health — the SSOT that replaces the hand-typed
 * `attrs.maturity` "N/10" magic number. The score is the count of ten named,
 * verifiable checks, so "why 9 and not 10" is always answerable: every point
 * traces to a concrete fact of the profile, and every missing point names the
 * exact action that earns it.
 *
 * Inputs are limited to fields available on BOTH the catalog row and the full
 * dossier (entity + attrs + code paths) so the same number renders everywhere
 * — a score that differed between the list and the profile would be a new lie.
 */
import { cleanDescription, hasAnswer } from "@/lib/project-display";
import { HEALTH_SIGNAL_BASE } from "@/components/projects/project-detail-types";

export type ProjectHealthInput = {
  description: string | null;
  gitUrl?: string | null;
  dirPath?: string | null;
  attrs: Record<string, string>;
};

export type ProjectHealthCheck = {
  key: string;
  label: string;
  pass: boolean;
  /** For failing checks: the concrete action that earns the point.
   *  For passing checks: the fact that earned it. */
  detail: string;
};

export type ProjectHealth = {
  score: number;
  max: number;
  checks: ProjectHealthCheck[];
};

const truncate = (value: string, n = 80) =>
  value.length > n ? `${value.slice(0, n - 1)}…` : value;

export function computeProjectHealth(input: ProjectHealthInput): ProjectHealth {
  const attrs = input.attrs;
  const description = cleanDescription(input.description ?? attrs["description"] ?? null);
  const liveUrl = attrs["production_url"] ?? attrs["url"];
  const repo = input.gitUrl || attrs["repo"] || attrs["github_repo"];

  const checks: ProjectHealthCheck[] = [
    {
      key: "brief",
      label: "Brief written",
      pass: Boolean(description),
      detail: description ? truncate(description) : "Write a one-line description of what this project is.",
    },
    {
      key: "mission",
      label: "Mission stated",
      pass: hasAnswer(attrs["mission"]),
      detail: hasAnswer(attrs["mission"])
        ? truncate(attrs["mission"])
        : "State the mission in Context — agents build toward it.",
    },
    {
      key: "code",
      label: "Code connected",
      pass: Boolean(repo || input.dirPath),
      detail: repo
        ? truncate(repo)
        : input.dirPath
          ? truncate(input.dirPath)
          : "Link a repository or local path so agents can work on it.",
    },
    {
      key: "live",
      label: "Live URL",
      pass: hasAnswer(liveUrl),
      detail: hasAnswer(liveUrl) ? truncate(liveUrl) : "Add a production URL when something is deployed.",
    },
    {
      key: "stage",
      label: "Stage declared",
      pass: hasAnswer(attrs["status"]),
      detail: hasAnswer(attrs["status"]) ? attrs["status"] : "Set the lifecycle stage (planning / development / production).",
    },
    // The three attention signals: an open callout costs a point until fixed.
    ...HEALTH_SIGNAL_BASE.map((signal) => ({
      key: signal.key,
      label: `No ${signal.label.toLowerCase()}`,
      pass: !hasAnswer(attrs[signal.key]),
      detail: hasAnswer(attrs[signal.key])
        ? truncate(attrs[signal.key])
        : `No open ${signal.label.toLowerCase()} recorded.`,
    })),
    {
      key: "next",
      label: "Next step queued",
      pass: hasAnswer(attrs["next_step"]),
      detail: hasAnswer(attrs["next_step"])
        ? truncate(attrs["next_step"])
        : "Queue the next step so work can be dispatched in one click.",
    },
    {
      key: "done",
      label: "Definition of done",
      pass: hasAnswer(attrs["definition_of_done"]),
      detail: hasAnswer(attrs["definition_of_done"])
        ? truncate(attrs["definition_of_done"])
        : "Define when a change counts as done — agents verify against it.",
    },
  ];

  return {
    score: checks.filter((c) => c.pass).length,
    max: checks.length,
    checks,
  };
}

/** One-line agent/tooltip rendering: "7/10 — missing: Live URL, Next step queued". */
export function describeProjectHealth(health: ProjectHealth): string {
  const missing = health.checks.filter((c) => !c.pass).map((c) => c.label);
  return missing.length === 0
    ? `${health.score}/${health.max}`
    : `${health.score}/${health.max} — missing: ${missing.join(", ")}`;
}
