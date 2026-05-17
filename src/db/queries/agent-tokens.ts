import { randomBytes } from "crypto";
import { db } from "@/db";
import { agentTokens, type AgentToken } from "@/db/schema";
import { eq, and, or, gt, isNull } from "drizzle-orm";

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
