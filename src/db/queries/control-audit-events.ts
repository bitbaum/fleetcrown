import { createHash } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { controlAuditEvents, type NewControlAuditEvent } from "@/db/schema/control-audit-events";

export function promptFingerprint(prompt: string | null | undefined) {
  const text = prompt?.trim();
  if (!text) return { promptHash: null, promptPreview: null };
  return {
    promptHash: createHash("sha256").update(text).digest("hex").slice(0, 16),
    promptPreview: text.replace(/\s+/g, " ").slice(0, 220),
  };
}

export function recordControlAuditEvent(entry: Omit<NewControlAuditEvent, "id" | "createdAt">): Promise<unknown> {
  return db.insert(controlAuditEvents).values(entry).catch((err) => {
    console.error("[control-audit] insert failed:", err, "for entry:", {
      event: entry.event,
      source: entry.source,
      action: entry.action,
      projectKey: entry.projectKey,
    });
  });
}

export async function getRecentControlAuditEvents(userId: string, limit = 20) {
  return db
    .select()
    .from(controlAuditEvents)
    .where(eq(controlAuditEvents.userId, userId))
    .orderBy(desc(controlAuditEvents.createdAt))
    .limit(limit);
}
