import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { entities, widgetTokens, type WidgetToken } from "@/db/schema";
import { ENTITY_TYPE } from "@/lib/constants/statuses";

/** Token prefix — makes a leaked string instantly identifiable as a
 *  write-only feedback-widget token (cf. ck_* agent tokens). */
const TOKEN_PREFIX = "fcw_";

function newToken(): string {
  return TOKEN_PREFIX + randomBytes(16).toString("hex");
}

export async function getActiveWidgetToken(userId: string, projectId: string): Promise<WidgetToken | null> {
  const row = await db.query.widgetTokens.findFirst({
    where: and(eq(widgetTokens.userId, userId), eq(widgetTokens.projectId, projectId), isNull(widgetTokens.revokedAt)),
  });
  return row ?? null;
}

/** Resolve a token string from the public ingest route. Active tokens only. */
export async function getWidgetTokenByToken(token: string): Promise<WidgetToken | null> {
  const row = await db.query.widgetTokens.findFirst({
    where: and(eq(widgetTokens.token, token), isNull(widgetTokens.revokedAt)),
  });
  return row ?? null;
}

export type WidgetTokenInput = {
  origins?: string[];
  /** Revoke the current token and mint a fresh one (invalidates the old snippet). */
  rotate?: boolean;
};

/**
 * Create the project's widget token if none exists; otherwise update its
 * origins — or mint a replacement when `rotate` is set. Returns null when
 * the project doesn't exist or isn't owned by the user.
 */
export async function upsertWidgetToken(userId: string, projectId: string, input: WidgetTokenInput = {}): Promise<WidgetToken | null> {
  const project = await db.query.entities.findFirst({
    where: and(eq(entities.id, projectId), eq(entities.userId, userId), eq(entities.type, ENTITY_TYPE.PROJECT)),
    columns: { id: true },
  });
  if (!project) return null;

  const existing = await getActiveWidgetToken(userId, projectId);
  const origins = input.origins?.filter(Boolean) ?? existing?.origins ?? null;

  if (existing && !input.rotate) {
    const [updated] = await db
      .update(widgetTokens)
      .set({ origins })
      .where(and(eq(widgetTokens.id, existing.id), eq(widgetTokens.userId, userId)))
      .returning();
    return updated ?? null;
  }

  if (existing) await revokeWidgetToken(userId, projectId);

  const [created] = await db
    .insert(widgetTokens)
    .values({ userId, projectId, token: newToken(), origins })
    .returning();
  return created ?? null;
}

export async function revokeWidgetToken(userId: string, projectId: string): Promise<boolean> {
  const [revoked] = await db
    .update(widgetTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(widgetTokens.userId, userId), eq(widgetTokens.projectId, projectId), isNull(widgetTokens.revokedAt)))
    .returning({ id: widgetTokens.id });
  return Boolean(revoked);
}
