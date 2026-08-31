import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Cloud transport for the inter-agent coordination bus. Agents write messages to
 * each other as PROTOCOL.md blocks in ~/.claude/cross-project/inbox-*.md on the
 * builder's machine; the runner parses new ones and pushes them here so the
 * hosted /agents feed can show them (the files never leave the builder). The
 * private twin of OrangeCat's public timeline.
 *
 * Idempotent on (userId, msgId): the runner re-pushes the same tail every
 * heartbeat, so ingest is insert-if-new. msgId is the parser's stable message
 * id (ts + sender + recipient + body hash).
 */
export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stable per-message id from the parser — the idempotency key. */
    msgId: text("msg_id").notNull(),
    fromAgent: text("from_agent").notNull(),
    toAgent: text("to_agent").notNull(),
    /** task | result | question | escalation (from the embedded schema payload). */
    type: text("type"),
    /** open | claimed | in_progress | done | blocked. */
    status: text("status"),
    re: text("re"),
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    /** The message's own timestamp (PROTOCOL "YYYY-MM-DD HH:MM"), kept as text. */
    ts: text("ts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agent_messages_user_msg_unique").on(t.userId, t.msgId),
    index("idx_agent_messages_user_created").on(t.userId, t.createdAt),
  ],
);

export type AgentMessageRow = typeof agentMessages.$inferSelect;
export type NewAgentMessageRow = typeof agentMessages.$inferInsert;
