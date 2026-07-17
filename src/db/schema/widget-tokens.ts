import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

/**
 * Widget tokens — authorize the embeddable feedback widget to SUBMIT feedback
 * for one project. The token is public by design (visible in the customer
 * page's source), so the capability is write-only: a token can create
 * site_feedback rows, never read anything.
 *
 * Deliberately separate from project_shares: shares grant dossier reads and
 * revoke on a different lifecycle — coupling them would let a revoked share
 * link silently kill a customer's live widget.
 */
export const widgetTokens = pgTable("widget_tokens", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:     text("token").notNull().unique(),
  /** Origin allowlist for submissions. NULL or empty = accept any origin
   *  (rate limiting + revocation are the spam backstops). */
  origins:   jsonb("origins").$type<string[]>(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_widget_tokens_project").on(t.projectId),
  index("idx_widget_tokens_user").on(t.userId),
]);

export type WidgetToken = typeof widgetTokens.$inferSelect;
export type NewWidgetToken = typeof widgetTokens.$inferInsert;
