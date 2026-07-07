import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory, type NewPromptHistoryRow } from "@/db/schema/prompt-history";
import { toPromptDisplayFields, type PromptDisplayFields } from "@/lib/activity-status";

export async function insertPromptHistory(userId: string, row: Omit<NewPromptHistoryRow, "id" | "userId" | "dispatchedAt">) {
  await db.insert(promptHistory).values({ ...row, userId });
}

export type RecentCustomPrompt = {
  customPrompt: string;
  count: number;
  lastUsedAt: string;
};

// Per-project: deduplicated custom prompts sorted by recency and frequency
export async function getRecentCustomPromptsByProjectKey(
  userId: string,
  projectKey: string,
  limit = 8,
): Promise<RecentCustomPrompt[]> {
  const rows = await db
    .select({
      customPrompt: promptHistory.customPrompt,
      count: sql<number>`count(*)::int`,
      lastUsedAt: sql<string>`max(dispatched_at)::text`,
    })
    .from(promptHistory)
    .where(
      and(
        eq(promptHistory.userId, userId),
        eq(promptHistory.projectKey, projectKey),
        eq(promptHistory.intent, "custom"),
        sql`custom_prompt is not null`,
      ),
    )
    .groupBy(promptHistory.customPrompt)
    .orderBy(desc(sql`max(dispatched_at)`))
    .limit(limit);

  return rows
    .filter((r): r is typeof r & { customPrompt: string } => r.customPrompt !== null)
    .map((r) => ({ customPrompt: r.customPrompt, count: r.count, lastUsedAt: r.lastUsedAt }));
}

// Batch version for the control panel — one query for all projects
export async function getRecentCustomPromptsByProjectKeys(
  userId: string,
  projectKeys: string[],
): Promise<Map<string, RecentCustomPrompt[]>> {
  if (projectKeys.length === 0) return new Map();

  const rows = await db
    .select({
      projectKey: promptHistory.projectKey,
      customPrompt: promptHistory.customPrompt,
      count: sql<number>`count(*)::int`,
      lastUsedAt: sql<string>`max(dispatched_at)::text`,
    })
    .from(promptHistory)
    .where(
      and(
        eq(promptHistory.userId, userId),
        inArray(promptHistory.projectKey, projectKeys),
        eq(promptHistory.intent, "custom"),
        sql`custom_prompt is not null`,
      ),
    )
    .groupBy(promptHistory.projectKey, promptHistory.customPrompt)
    .orderBy(desc(sql`max(dispatched_at)`));

  const result = new Map<string, RecentCustomPrompt[]>();
  for (const row of rows) {
    if (!row.customPrompt) continue;
    const entry = result.get(row.projectKey) ?? [];
    if (entry.length < 8) {
      entry.push({ customPrompt: row.customPrompt, count: row.count, lastUsedAt: row.lastUsedAt });
    }
    result.set(row.projectKey, entry);
  }
  return result;
}

// ── Shared select shape + mappers ─────────────────────────────────────────────

const DISPATCH_COLS = {
  id: promptHistory.id,
  projectId: promptHistory.projectId,
  projectKey: promptHistory.projectKey,
  adapter: promptHistory.adapter,
  intent: promptHistory.intent,
  customPrompt: promptHistory.customPrompt,
  resolvedPrompt: promptHistory.resolvedPrompt,
  dispatchedAt: promptHistory.dispatchedAt,
};

type RawDispatchRow = {
  id: string;
  projectId: string | null;
  projectKey: string;
  adapter: string;
  intent: string;
  customPrompt: string | null;
  resolvedPrompt: string | null;
  dispatchedAt: Date;
};

// All dispatches — for the dedicated history page (dispatchedAt stays as Date for RSC prop passing)
export type HistoryItem = Omit<RawDispatchRow, "customPrompt" | "resolvedPrompt"> & PromptDisplayFields;

// Last N dispatches — for activity feeds serialized through JSON API (dispatchedAt as ISO string)
export type ActivityItem = Omit<HistoryItem, "dispatchedAt"> & { dispatchedAt: string };

function toHistoryItem(r: RawDispatchRow): HistoryItem {
  const display = toPromptDisplayFields(r);
  return {
    id: r.id,
    projectId: r.projectId ?? null,
    projectKey: r.projectKey,
    adapter: r.adapter,
    intent: r.intent,
    ...display,
    dispatchedAt: r.dispatchedAt,
  };
}

function toActivityItem(r: RawDispatchRow): ActivityItem {
  return { ...toHistoryItem(r), dispatchedAt: r.dispatchedAt.toISOString() };
}

// ── Query functions ───────────────────────────────────────────────────────────

export async function getPromptHistory(userId: string, limit = 200): Promise<HistoryItem[]> {
  const rows = await db
    .select(DISPATCH_COLS)
    .from(promptHistory)
    .where(eq(promptHistory.userId, userId))
    .orderBy(desc(promptHistory.dispatchedAt))
    .limit(limit);
  return rows.map(toHistoryItem);
}

export async function getRecentActivity(userId: string, hours = 24, limit = 30): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select(DISPATCH_COLS)
    .from(promptHistory)
    .where(and(eq(promptHistory.userId, userId), gte(promptHistory.dispatchedAt, since)))
    .orderBy(desc(promptHistory.dispatchedAt))
    .limit(limit);
  return rows.map(toActivityItem);
}

// The single most-recent dispatch for a project — powers the Duet watch view,
// where each pane shows one agent's last prompt, live. Matched case-insensitively
// on projectKey because the dispatch tab and the registered project name can
// differ in case (see recordSessionHandoffChangelog's ilike match).
export async function getLastPromptByProjectKey(userId: string, projectKey: string): Promise<ActivityItem | null> {
  const [row] = await db
    .select(DISPATCH_COLS)
    .from(promptHistory)
    .where(and(eq(promptHistory.userId, userId), sql`lower(${promptHistory.projectKey}) = lower(${projectKey})`))
    .orderBy(desc(promptHistory.dispatchedAt))
    .limit(1);
  return row ? toActivityItem(row) : null;
}

export async function getProjectPromptActivity(userId: string, projectId: string, limit = 50): Promise<ActivityItem[]> {
  const rows = await db
    .select(DISPATCH_COLS)
    .from(promptHistory)
    .where(and(eq(promptHistory.userId, userId), eq(promptHistory.projectId, projectId)))
    .orderBy(desc(promptHistory.dispatchedAt))
    .limit(limit);
  return rows.map(toActivityItem);
}
