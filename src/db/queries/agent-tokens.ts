import { randomBytes } from "crypto";
import { db } from "@/db";
import { agentTokens, type AgentToken } from "@/db/schema";
import { eq, and, or, gt, isNull, lt, desc } from "drizzle-orm";

export function generateToken(): string {
  return "ck_" + randomBytes(32).toString("hex");
}

export async function createAgentToken(
  userId: string,
  label: string,
  orgId?: string | null,
): Promise<{ token: string; record: AgentToken }> {
  const token = generateToken();
  const [record] = await db
    .insert(agentTokens)
    .values({ token, label, userId, orgId: orgId ?? null })
    .returning();
  return { token, record };
}

export async function listAgentTokens(userId: string): Promise<AgentToken[]> {
  return db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(agentTokens.createdAt);
}

export async function deleteAgentToken(id: string, userId: string): Promise<void> {
  await db.delete(agentTokens).where(
    and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)),
  );
}

/**
 * Find a reusable event-stream token for `userId`. Returns the plaintext
 * token string + record, or null if none qualifies.
 *
 * "Reusable" = label='event-stream', not expired, and last_used_at within
 * `maxIdleMs` (default 7 days). The /api/event-stream-token endpoint
 * previously minted a fresh token on every call, leaking ~1 token per
 * browser session per day. Reuse caps the per-user table footprint at
 * "one live event-stream token per active week."
 */
export async function getReusableEventStreamToken(
  userId: string,
  maxIdleMs: number = 7 * 24 * 60 * 60 * 1000,
): Promise<{ token: string; record: AgentToken } | null> {
  const now = new Date();
  const cutoff = new Date(Date.now() - maxIdleMs);
  const [record] = await db
    .select()
    .from(agentTokens)
    .where(
      and(
        eq(agentTokens.userId, userId),
        eq(agentTokens.label, "event-stream"),
        or(isNull(agentTokens.expiresAt), gt(agentTokens.expiresAt, now)),
        // last_used_at recently — covers the "active browser" case. NULL
        // last_used_at means never used; treat those as too stale to reuse
        // (a token that was minted but never validated against the bridge
        // is likely abandoned).
        gt(agentTokens.lastUsedAt, cutoff),
      ),
    )
    .orderBy(desc(agentTokens.lastUsedAt))
    .limit(1);
  return record ? { token: record.token, record } : null;
}

/**
 * Delete event-stream tokens that haven't been touched in `olderThanMs`
 * (default 30 days). Used by the daily hygiene cron to keep the
 * agent_tokens table bounded.
 *
 * Returns the number of rows deleted, for telemetry. Other label values
 * ("Fleet Runner (auto)", custom-named tokens) are NEVER touched —
 * removing them would break the daemon silently.
 */
export async function deleteStaleEventStreamTokens(
  olderThanMs: number = 30 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await db
    .delete(agentTokens)
    .where(
      and(
        eq(agentTokens.label, "event-stream"),
        or(
          and(isNull(agentTokens.lastUsedAt), lt(agentTokens.createdAt, cutoff)),
          lt(agentTokens.lastUsedAt, cutoff),
        ),
      ),
    )
    .returning({ id: agentTokens.id });
  return result.length;
}

/** Validates a bearer token and returns the associated userId, or null if invalid/expired. */
export async function validateAgentToken(token: string): Promise<{ userId: string; orgId: string | null } | null> {
  const now = new Date();
  const [row] = await db
    .select({ id: agentTokens.id, userId: agentTokens.userId, orgId: agentTokens.orgId })
    .from(agentTokens)
    .where(
      and(
        eq(agentTokens.token, token),
        or(isNull(agentTokens.expiresAt), gt(agentTokens.expiresAt, now)),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Touch lastUsedAt (fire-and-forget, don't await).
  db.update(agentTokens)
    .set({ lastUsedAt: now })
    .where(eq(agentTokens.id, row.id))
    .catch(() => {});

  return { userId: row.userId, orgId: row.orgId };
}
