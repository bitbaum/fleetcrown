import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { promptHistory, type NewPromptHistoryRow } from "@/db/schema/prompt-history";

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

// Last N dispatches across all projects — for the live activity feed
export type ActivityItem = {
  id: string;
  projectKey: string;
  adapter: string;
  intent: string;
  customPrompt: string | null;
  dispatchedAt: string;
};

export async function getRecentActivity(userId: string, hours = 24, limit = 30): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: promptHistory.id,
      projectKey: promptHistory.projectKey,
      adapter: promptHistory.adapter,
      intent: promptHistory.intent,
      customPrompt: promptHistory.customPrompt,
      dispatchedAt: promptHistory.dispatchedAt,
    })
    .from(promptHistory)
    .where(
      and(
        eq(promptHistory.userId, userId),
        gte(promptHistory.dispatchedAt, since),
      ),
    )
    .orderBy(desc(promptHistory.dispatchedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    projectKey: r.projectKey,
    adapter: r.adapter,
    intent: r.intent,
    customPrompt: r.customPrompt ?? null,
    dispatchedAt: r.dispatchedAt.toISOString(),
  }));
}

