import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory, orchestrationRuns, userProjects } from "@/db/schema";
import { splitSessionItems } from "@/lib/session-content";
import { getAdapterLabel, getIntentLabel } from "@/config/control-intents";

export const DIGEST_WINDOWS = ["hour", "day", "week", "month"] as const;
export type DigestWindow = (typeof DIGEST_WINDOWS)[number];

export type DigestProjectOption = {
  key: string;
  label: string;
};

export type DigestTimelineItem = {
  id: string;
  occurredAt: string;
  projectKey: string;
  title: string;
  body: string;
  tone: "prompt" | "run" | "error";
};

export type ProjectDigest = {
  window: DigestWindow;
  projectKey: string | null;
  since: string;
  until: string;
  projects: DigestProjectOption[];
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

function windowStart(window: DigestWindow): Date {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  if (window === "hour") return new Date(now - hour);
  if (window === "day") return new Date(now - 24 * hour);
  if (window === "week") return new Date(now - 7 * 24 * hour);
  return new Date(now - 30 * 24 * hour);
}

function normalizeWindow(value: string | null | undefined): DigestWindow {
  return DIGEST_WINDOWS.includes(value as DigestWindow) ? value as DigestWindow : "day";
}

function compactItems(values: string[], limit = 8): string[] {
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

export async function getProjectDigest(
  userId: string,
  opts: { window?: string | null; projectKey?: string | null } = {},
): Promise<ProjectDigest> {
  const window = normalizeWindow(opts.window);
  const since = windowStart(window);
  const until = new Date();
  const projectKey = opts.projectKey && opts.projectKey !== "all" ? opts.projectKey : null;

  const projectRows = await db
    .select({ key: userProjects.name })
    .from(userProjects)
    .where(and(eq(userProjects.userId, userId), eq(userProjects.isActive, true)))
    .orderBy(userProjects.name);
  const projects = projectRows.map((row) => ({ key: row.key, label: row.key }));

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

  const [prompts, runs] = await Promise.all([
    db
      .select({
        id: promptHistory.id,
        projectKey: promptHistory.projectKey,
        adapter: promptHistory.adapter,
        intent: promptHistory.intent,
        customPrompt: promptHistory.customPrompt,
        dispatchedAt: promptHistory.dispatchedAt,
      })
      .from(promptHistory)
      .where(and(...promptConditions))
      .orderBy(desc(promptHistory.dispatchedAt))
      .limit(200),
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
      .limit(200),
  ]);

  const finishedRuns = runs.filter((run) => run.finishedAt);
  const errorRuns = runs.filter((run) => run.outcome === "error" || run.state === "error" || run.payload?.error);

  const completed = compactItems(
    finishedRuns.flatMap((run) => run.summary?.done ? splitSessionItems(run.summary.done) : []),
    10,
  );
  const next = compactItems(
    runs.flatMap((run) => run.summary?.next ? splitSessionItems(run.summary.next) : []),
    8,
  );
  const promptTexts = compactItems(
    prompts.map((prompt) => prompt.customPrompt || getIntentLabel(prompt.intent)),
    8,
  );

  const promptTimeline: DigestTimelineItem[] = prompts.slice(0, 60).map((prompt) => ({
    id: `prompt:${prompt.id}`,
    occurredAt: prompt.dispatchedAt.toISOString(),
    projectKey: prompt.projectKey,
    title: `${getAdapterLabel(prompt.adapter)} · ${prompt.intent === "custom" ? "Custom prompt" : getIntentLabel(prompt.intent)}`,
    body: prompt.customPrompt || getIntentLabel(prompt.intent),
    tone: "prompt",
  }));
  const runTimeline: DigestTimelineItem[] = runs.slice(0, 60).map((run) => ({
    id: `run:${run.id}`,
    occurredAt: (run.finishedAt ?? run.startedAt).toISOString(),
    projectKey: run.projectKey,
    title: `${getAdapterLabel(run.adapter)} · ${getIntentLabel(run.intent)} · ${run.outcome ?? run.state}`,
    body: run.summary?.done || run.summary?.next || run.payload?.resultText || run.payload?.error || "",
    tone: run.outcome === "error" || run.state === "error" ? "error" : "run",
  }));

  const timeline = [...promptTimeline, ...runTimeline]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 80);

  return {
    window,
    projectKey,
    since: since.toISOString(),
    until: until.toISOString(),
    projects,
    stats: {
      promptsSent: prompts.length,
      runsStarted: runs.length,
      runsFinished: finishedRuns.length,
      success: runs.filter((run) => run.outcome === "success").length,
      partial: runs.filter((run) => run.outcome === "partial").length,
      error: errorRuns.length,
    },
    completed,
    next,
    prompts: promptTexts,
    timeline,
  };
}
