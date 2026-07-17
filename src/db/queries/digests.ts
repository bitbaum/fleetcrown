import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory, orchestrationRuns, userProjects, claudeCodeHistory } from "@/db/schema";
import { splitSessionItems } from "@/lib/session-content";
import { getBlockedReasonsForRuns } from "@/db/queries/run-events";
import { getAdapterLabel, getIntentLabel } from "@/config/control-intents";
import {
  isErrorRun,
  promptDisplayBody,
  runStatus,
  STATUS_RANK,
} from "@/lib/activity-status";
import type { StatusTone } from "@/lib/constants/statuses";
import { DAY_MS, HOUR_MS, WEEK_MS } from "@/lib/constants/time";

// Re-export pure helpers so existing consumers keep working without changing
// imports. New code should prefer @/lib/activity-status.
export { isErrorRun, promptDisplayBody, runStatus } from "@/lib/activity-status";

// ─── Caps ────────────────────────────────────────────────────────────────────
// All bounded inputs/outputs. None of these protect correctness — they cap
// memory and (downstream) LLM token usage. Named here so a change is one edit.

const MAX_RAW_ROWS_PER_QUERY = 200;
const MAX_PROMPT_SAMPLES_FOR_TIMELINE = 60;
const MAX_RUN_SAMPLES_FOR_TIMELINE = 60;
const MAX_LOCAL_CHAT_SAMPLES_FOR_TIMELINE = 60;
const MAX_TIMELINE_ITEMS = 120;
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
  status: StatusTone;
  kind: "prompt" | "run" | "local_chat";
  /** Short right-aligned fact (e.g. a run's duration). Optional. */
  detail?: string;
};

/** Human duration between two timestamps, e.g. "2m 14s" / "830ms" / "1h 3m". */
function formatDuration(startMs: number, endMs: number): string | undefined {
  const ms = endMs - startMs;
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export type ProjectStatus = {
  key: string;
  label: string;
  errors: number;
  warning: number;
  success: number;
  total: number;
  worst: StatusTone;
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
  if (window === "hour") return new Date(now - HOUR_MS);
  if (window === "day") return new Date(now - DAY_MS);
  if (window === "week") return new Date(now - WEEK_MS);
  return new Date(now - 30 * DAY_MS);
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

  const localChatConditions = [
    eq(claudeCodeHistory.userId, userId),
    gte(claudeCodeHistory.occurredAt, since),
    eq(claudeCodeHistory.promptType, "user"),
  ];
  if (projectKey) localChatConditions.push(eq(claudeCodeHistory.projectKey, projectKey));

  // Activity counts per project run unfiltered so the chip wall can rank
  // projects by hotness even when one is currently selected.
  const [projectRows, promptCounts, runCounts, localChatCounts, prompts, runs, localChats] = await Promise.all([
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
        projectKey: claudeCodeHistory.projectKey,
        n: sql<number>`count(*)::int`,
      })
      .from(claudeCodeHistory)
      .where(and(
        eq(claudeCodeHistory.userId, userId),
        gte(claudeCodeHistory.occurredAt, since),
        eq(claudeCodeHistory.promptType, "user"),
      ))
      .groupBy(claudeCodeHistory.projectKey)
      // Degrade gracefully when the table doesn't exist yet (env where the
      // schema hasn't been applied — typically prod before someone runs the
      // CREATE TABLE). Empty array = digest still renders prompts + runs.
      .catch(() => [] as { projectKey: string | null; n: number }[]),
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
    db
      .select({
        id: claudeCodeHistory.id,
        projectKey: claudeCodeHistory.projectKey,
        projectPath: claudeCodeHistory.projectPath,
        gitBranch: claudeCodeHistory.gitBranch,
        sessionId: claudeCodeHistory.sessionId,
        promptText: claudeCodeHistory.promptText,
        occurredAt: claudeCodeHistory.occurredAt,
      })
      .from(claudeCodeHistory)
      .where(and(...localChatConditions))
      .orderBy(desc(claudeCodeHistory.occurredAt))
      .limit(MAX_RAW_ROWS_PER_QUERY)
      // Same fallback as localChatCounts — missing table degrades cleanly.
      .catch(() => [] as Array<{
        id: string; projectKey: string | null; projectPath: string;
        gitBranch: string | null; sessionId: string; promptText: string; occurredAt: Date;
      }>),
  ]);

  return { projectRows, promptCounts, runCounts, localChatCounts, prompts, runs, localChats };
}

type ActivityRows = Awaited<ReturnType<typeof fetchActivityRows>>;
type PromptRow = ActivityRows["prompts"][number];
type RunRow = ActivityRows["runs"][number];
type LocalChatRow = ActivityRows["localChats"][number];

// ─── Builders — each one does one thing ─────────────────────────────────────

function buildProjectsList(
  projectRows: ActivityRows["projectRows"],
  promptCounts: ActivityRows["promptCounts"],
  runCounts: ActivityRows["runCounts"],
  localChatCounts: ActivityRows["localChatCounts"],
): DigestProjectOption[] {
  const activityByProject = new Map<string, number>();
  for (const row of promptCounts) activityByProject.set(row.projectKey, (activityByProject.get(row.projectKey) ?? 0) + row.n);
  for (const row of runCounts) activityByProject.set(row.projectKey, (activityByProject.get(row.projectKey) ?? 0) + row.n);
  for (const row of localChatCounts) {
    if (!row.projectKey) continue;
    activityByProject.set(row.projectKey, (activityByProject.get(row.projectKey) ?? 0) + row.n);
  }

  return projectRows
    .map((row) => ({ key: row.key, label: row.key, activity: activityByProject.get(row.key) ?? 0 }))
    .sort((a, b) => b.activity - a.activity || a.label.localeCompare(b.label));
}

function buildStats(
  prompts: PromptRow[],
  runs: RunRow[],
  promptCounts: ActivityRows["promptCounts"],
  runCounts: ActivityRows["runCounts"],
  projectKey: string | null,
): ProjectDigest["stats"] {
  // promptsSent / runsStarted come from real count(*) aggregates (scoped to the
  // active project, or summed across all projects when "all" is selected) — NOT
  // the raw `prompts`/`runs` arrays, which are capped at MAX_RAW_ROWS_PER_QUERY
  // (200). A busy window showed "200 prompts" when the true count was higher
  // (e.g. 277 over 30 days). The per-outcome breakdown still reads the capped
  // sample: it needs per-row outcome data and runs rarely exceed 200/window.
  const sumScoped = (counts: ActivityRows["promptCounts"] | ActivityRows["runCounts"]) =>
    counts.reduce((sum, r) => (projectKey && r.projectKey !== projectKey ? sum : sum + r.n), 0);
  void prompts; // retained for signature symmetry / future per-row stats
  return {
    promptsSent: sumScoped(promptCounts),
    runsStarted: sumScoped(runCounts),
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

function buildLocalChatTimeline(rows: LocalChatRow[]): DigestTimelineItem[] {
  return rows.slice(0, MAX_LOCAL_CHAT_SAMPLES_FOR_TIMELINE).map((row) => {
    const branch = row.gitBranch ? ` · ${row.gitBranch}` : "";
    return {
      id: `local_chat:${row.id}`,
      occurredAt: row.occurredAt.toISOString(),
      projectKey: row.projectKey ?? "(unscoped)",
      title: `Claude Code · local chat${branch}`,
      body: row.promptText,
      status: "neutral" as const,
      kind: "local_chat" as const,
    };
  });
}

function buildRunTimeline(runs: RunRow[], blockedReasons: Map<string, string>): DigestTimelineItem[] {
  return runs.slice(0, MAX_RUN_SAMPLES_FOR_TIMELINE).map((run) => {
    // Show what the agent actually did AND what's next — the two facts that
    // make the timeline useful — plus the error when it failed.
    const done = run.summary?.done?.trim();
    const next = run.summary?.next?.trim();
    // The REAL cause wins over the reaper's circular "timed out — exceeded max
    // duration": a blocked-event reason ("agent isn't generating", "not
    // authenticated (401)") tells you WHY without opening a transcript. Capped
    // so a long operator-remediation message doesn't flood the timeline.
    const blocked = blockedReasons.get(run.id);
    const rawErr = (blocked || run.payload?.error?.trim() || "").trim();
    const err = rawErr.length > 160 ? `${rawErr.slice(0, 157)}…` : rawErr;
    const parts: string[] = [];
    if (done) parts.push(done);
    // Cross-model verdict — the moat made visible. When a project declares a
    // definition_of_done, a DIFFERENT model lineage judged this worker's handoff
    // (see dod-gate.ts). Surface WHO judged and WHAT they caught, so "done"
    // demonstrably means a second mind agreed — not the agent grading itself.
    const v = run.summary?.verification;
    if (v) {
      const judge = v.judge.includes("/") ? v.judge.split("/").pop() : v.judge;
      const worker = getAdapterLabel(run.adapter);
      parts.push(
        v.met
          ? `✓ Cross-model check — ${worker} did it, ${judge} verified the definition of done is met`
          : `✗ Cross-model check — ${worker} did it, ${judge} found the definition of done NOT met${v.gap ? `: ${v.gap}` : ""}`,
      );
    }
    if (next) parts.push(`Next: ${next}`);
    if (!parts.length && run.payload?.resultText) parts.push(run.payload.resultText);
    if (err) parts.push(`Error: ${err}`);
    const detail = run.finishedAt
      ? formatDuration(run.startedAt.getTime(), run.finishedAt.getTime())
      : "running";
    return {
      id: `run:${run.id}`,
      occurredAt: (run.finishedAt ?? run.startedAt).toISOString(),
      projectKey: run.projectKey,
      title: `${getAdapterLabel(run.adapter)} · ${getIntentLabel(run.intent)} · ${run.outcome ?? run.state}`,
      body: parts.join(" — "),
      status: runStatus(run),
      kind: "run" as const,
      detail,
    };
  });
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

  const projects = buildProjectsList(rows.projectRows, rows.promptCounts, rows.runCounts, rows.localChatCounts);
  const projectStatuses = buildProjectStatuses(rows.runs, projects);
  const stats = buildStats(rows.prompts, rows.runs, rows.promptCounts, rows.runCounts, projectKey);
  const compacted = buildCompacted(rows.prompts, rows.runs);

  // Real failure causes for the timeline runs, so "why did this fail" is
  // answered right here instead of in a transcript. Batched over the runs the
  // timeline actually shows.
  const timelineRunIds = rows.runs.slice(0, MAX_RUN_SAMPLES_FOR_TIMELINE).map((r) => r.id);
  const blockedReasons = await getBlockedReasonsForRuns(timelineRunIds);

  const timeline = [
    ...buildPromptTimeline(rows.prompts),
    ...buildRunTimeline(rows.runs, blockedReasons),
    ...buildLocalChatTimeline(rows.localChats),
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
