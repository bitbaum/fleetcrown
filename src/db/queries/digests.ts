import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory, orchestrationRuns, userProjects } from "@/db/schema";
import { splitSessionItems } from "@/lib/session-content";
import { getAdapterLabel, getIntentLabel } from "@/config/control-intents";
import {
  isErrorRun,
  promptDisplayBody,
  runStatus,
  STATUS_RANK,
  type EventStatus,
} from "@/lib/activity-status";

// Re-export pure helpers + the status type so existing consumers keep working
// without changing imports. New code should prefer @/lib/activity-status.
export { isErrorRun, promptDisplayBody, runStatus } from "@/lib/activity-status";
export type { EventStatus } from "@/lib/activity-status";

// ─── Caps ────────────────────────────────────────────────────────────────────
// All bounded inputs/outputs. None of these protect correctness — they cap
// memory and (downstream) LLM token usage. Named here so a change is one edit.

const MAX_RAW_ROWS_PER_QUERY = 200;
const MAX_PROMPT_SAMPLES_FOR_TIMELINE = 60;
const MAX_RUN_SAMPLES_FOR_TIMELINE = 60;
const MAX_TIMELINE_ITEMS = 80;
const COMPACT_LIMITS = {
  completed: 10,
  next: 8,
  prompts: 8,
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export const DIGEST_WINDOWS = ["hour", "day", "week", "month"] as const;
export type DigestWindow = (typeof DIGEST_WINDOWS)[number];

// All-time lookback for the empty state. The activity view falls back to this
// when the current window has no rows, so the page never lies that there's
// "nothing" when there's a rich history behind a too-narrow filter.
export type ActivitySnapshot = {
  latestPromptAt: string | null;
  latestPromptProject: string | null;
  totalPrompts: number;
  distinctProjects: number;
};

export async function getActivitySnapshot(userId: string): Promise<ActivitySnapshot> {
  const [counts, latest] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        distinctProjects: sql<number>`count(distinct ${promptHistory.projectKey})::int`,
      })
      .from(promptHistory)
      .where(eq(promptHistory.userId, userId)),
    db
      .select({
        projectKey: promptHistory.projectKey,
        dispatchedAt: promptHistory.dispatchedAt,
      })
      .from(promptHistory)
      .where(eq(promptHistory.userId, userId))
      .orderBy(desc(promptHistory.dispatchedAt))
      .limit(1),
  ]);
  return {
    latestPromptAt: latest[0]?.dispatchedAt.toISOString() ?? null,
    latestPromptProject: latest[0]?.projectKey ?? null,
    totalPrompts: counts[0]?.total ?? 0,
    distinctProjects: counts[0]?.distinctProjects ?? 0,
  };
}

export type DigestProjectOption = {
  key: string;
  label: string;
  activity: number;
};

export type DigestTimelineItem = {
  id: string;
  occurredAt: string;
  projectKey: string;
  title: string;
  body: string;
  status: EventStatus;
  kind: "prompt" | "run";
};

export type ProjectStatus = {
  key: string;
  label: string;
  errors: number;
  warning: number;
  success: number;
  total: number;
  worst: EventStatus;
};

export type ProjectDigest = {
  window: DigestWindow;
  projectKey: string | null;
  since: string;
  until: string;
  projects: DigestProjectOption[];
  projectStatuses: ProjectStatus[];
  stats: {
    promptsSent: number;
    runsStarted: number;
    runsFinished: number;
    success: number;
    partial: number;
    error: number;
  };
  completed: string[];
  next: string[];
  prompts: string[];
  timeline: DigestTimelineItem[];
};

// ─── Window resolution ───────────────────────────────────────────────────────

function windowStart(window: DigestWindow): Date {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  if (window === "hour") return new Date(now - HOUR);
  if (window === "day") return new Date(now - 24 * HOUR);
  if (window === "week") return new Date(now - 7 * 24 * HOUR);
  return new Date(now - 30 * 24 * HOUR);
}

function normalizeWindow(value: string | null | undefined): DigestWindow {
  return DIGEST_WINDOWS.includes(value as DigestWindow) ? (value as DigestWindow) : "day";
}

function compactItems(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Raw data fetch ──────────────────────────────────────────────────────────

async function fetchActivityRows(userId: string, since: Date, projectKey: string | null) {
  const promptConditions = [
    eq(promptHistory.userId, userId),
    gte(promptHistory.dispatchedAt, since),
  ];
  if (projectKey) promptConditions.push(eq(promptHistory.projectKey, projectKey));

  const runConditions = [
    eq(orchestrationRuns.userId, userId),
    gte(orchestrationRuns.startedAt, since),
  ];
  if (projectKey) runConditions.push(eq(orchestrationRuns.projectKey, projectKey));

  // Activity counts per project run unfiltered so the chip wall can rank
  // projects by hotness even when one is currently selected.
  const [projectRows, promptCounts, runCounts, prompts, runs] = await Promise.all([
    db
      .select({ key: userProjects.name })
      .from(userProjects)
      .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)))
      .orderBy(userProjects.name),
    db
      .select({
        projectKey: promptHistory.projectKey,
        n: sql<number>`count(*)::int`,
      })
      .from(promptHistory)
      .where(and(eq(promptHistory.userId, userId), gte(promptHistory.dispatchedAt, since)))
      .groupBy(promptHistory.projectKey),
    db
      .select({
        projectKey: orchestrationRuns.projectKey,
        n: sql<number>`count(*)::int`,
      })
      .from(orchestrationRuns)
      .where(and(eq(orchestrationRuns.userId, userId), gte(orchestrationRuns.startedAt, since)))
      .groupBy(orchestrationRuns.projectKey),
    db
      .select({
        id: promptHistory.id,
        projectKey: promptHistory.projectKey,
        adapter: promptHistory.adapter,
        intent: promptHistory.intent,
        customPrompt: promptHistory.customPrompt,
        resolvedPrompt: promptHistory.resolvedPrompt,
        dispatchedAt: promptHistory.dispatchedAt,
      })
      .from(promptHistory)
      .where(and(...promptConditions))
      .orderBy(desc(promptHistory.dispatchedAt))
      .limit(MAX_RAW_ROWS_PER_QUERY),
    db
      .select({
        id: orchestrationRuns.id,
        projectKey: orchestrationRuns.projectKey,
        adapter: orchestrationRuns.adapter,
        intent: orchestrationRuns.intent,
        state: orchestrationRuns.state,
        outcome: orchestrationRuns.outcome,
        summary: orchestrationRuns.summary,
        payload: orchestrationRuns.payload,
        startedAt: orchestrationRuns.startedAt,
        finishedAt: orchestrationRuns.finishedAt,
      })
      .from(orchestrationRuns)
      .where(and(...runConditions))
      .orderBy(desc(orchestrationRuns.startedAt))
      .limit(MAX_RAW_ROWS_PER_QUERY),
  ]);

  return { projectRows, promptCounts, runCounts, prompts, runs };
}

type ActivityRows = Awaited<ReturnType<typeof fetchActivityRows>>;
type PromptRow = ActivityRows["prompts"][number];
type RunRow = ActivityRows["runs"][number];

// ─── Builders — each one does one thing ─────────────────────────────────────

function buildProjectsList(
  projectRows: ActivityRows["projectRows"],
  promptCounts: ActivityRows["promptCounts"],
  runCounts: ActivityRows["runCounts"],
): DigestProjectOption[] {
  const activityByProject = new Map<string, number>();
  for (const row of promptCounts) activityByProject.set(row.projectKey, (activityByProject.get(row.projectKey) ?? 0) + row.n);
  for (const row of runCounts) activityByProject.set(row.projectKey, (activityByProject.get(row.projectKey) ?? 0) + row.n);

  return projectRows
    .map((row) => ({ key: row.key, label: row.key, activity: activityByProject.get(row.key) ?? 0 }))
    .sort((a, b) => b.activity - a.activity || a.label.localeCompare(b.label));
}

function buildStats(prompts: PromptRow[], runs: RunRow[]): ProjectDigest["stats"] {
  return {
    promptsSent: prompts.length,
    runsStarted: runs.length,
    runsFinished: runs.filter((r) => r.finishedAt).length,
    success: runs.filter((r) => r.outcome === "success").length,
    partial: runs.filter((r) => r.outcome === "partial").length,
    error: runs.filter(isErrorRun).length,
  };
}

function buildPromptTimeline(prompts: PromptRow[]): DigestTimelineItem[] {
  return prompts.slice(0, MAX_PROMPT_SAMPLES_FOR_TIMELINE).map((prompt) => ({
    id: `prompt:${prompt.id}`,
    occurredAt: prompt.dispatchedAt.toISOString(),
    projectKey: prompt.projectKey,
    title: `${getAdapterLabel(prompt.adapter)} · ${prompt.intent === "custom" ? "Custom prompt" : getIntentLabel(prompt.intent)}`,
    body: promptDisplayBody(prompt),
    status: "neutral",
    kind: "prompt",
  }));
}

function buildRunTimeline(runs: RunRow[]): DigestTimelineItem[] {
  return runs.slice(0, MAX_RUN_SAMPLES_FOR_TIMELINE).map((run) => ({
    id: `run:${run.id}`,
    occurredAt: (run.finishedAt ?? run.startedAt).toISOString(),
    projectKey: run.projectKey,
    title: `${getAdapterLabel(run.adapter)} · ${getIntentLabel(run.intent)} · ${run.outcome ?? run.state}`,
    body: run.summary?.done || run.summary?.next || run.payload?.resultText || run.payload?.error || "",
    status: runStatus(run),
    kind: "run",
  }));
}

function buildProjectStatuses(runs: RunRow[], projects: DigestProjectOption[]): ProjectStatus[] {
  const byKey = new Map<string, ProjectStatus>();
  for (const project of projects) {
    if (project.activity === 0) continue;
    byKey.set(project.key, {
      key: project.key,
      label: project.label,
      errors: 0,
      warning: 0,
      success: 0,
      total: project.activity,
      worst: "neutral",
    });
  }
  for (const run of runs) {
    const entry = byKey.get(run.projectKey);
    if (!entry) continue;
    const status = runStatus(run);
    if (status === "negative") entry.errors++;
    else if (status === "warning") entry.warning++;
    else if (status === "positive") entry.success++;
    if (STATUS_RANK[status] > STATUS_RANK[entry.worst]) entry.worst = status;
  }
  return Array.from(byKey.values()).sort(
    (a, b) => STATUS_RANK[b.worst] - STATUS_RANK[a.worst] || b.total - a.total || a.label.localeCompare(b.label),
  );
}

function buildCompacted(prompts: PromptRow[], runs: RunRow[]) {
  const finishedRuns = runs.filter((r) => r.finishedAt);
  return {
    completed: compactItems(
      finishedRuns.flatMap((r) => (r.summary?.done ? splitSessionItems(r.summary.done) : [])),
      COMPACT_LIMITS.completed,
    ),
    next: compactItems(
      runs.flatMap((r) => (r.summary?.next ? splitSessionItems(r.summary.next) : [])),
      COMPACT_LIMITS.next,
    ),
    prompts: compactItems(
      prompts.map((p) => p.customPrompt || getIntentLabel(p.intent)),
      COMPACT_LIMITS.prompts,
    ),
  };
}

// ─── Public composer ─────────────────────────────────────────────────────────

export async function getProjectDigest(
  userId: string,
  opts: { window?: string | null; projectKey?: string | null } = {},
): Promise<ProjectDigest> {
  const window = normalizeWindow(opts.window);
  const since = windowStart(window);
  const until = new Date();
  const projectKey = opts.projectKey && opts.projectKey !== "all" ? opts.projectKey : null;

  const rows = await fetchActivityRows(userId, since, projectKey);

  const projects = buildProjectsList(rows.projectRows, rows.promptCounts, rows.runCounts);
  const projectStatuses = buildProjectStatuses(rows.runs, projects);
  const stats = buildStats(rows.prompts, rows.runs);
  const compacted = buildCompacted(rows.prompts, rows.runs);

  const timeline = [
    ...buildPromptTimeline(rows.prompts),
    ...buildRunTimeline(rows.runs),
  ]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, MAX_TIMELINE_ITEMS);

  return {
    window,
    projectKey,
    since: since.toISOString(),
    until: until.toISOString(),
    projects,
    projectStatuses,
    stats,
    completed: compacted.completed,
    next: compacted.next,
    prompts: compacted.prompts,
    timeline,
  };
}
