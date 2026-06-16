import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Server-side telemetry for failures that don't fit dedicated tables.
 * failed_commands captures pending_commands errors; debug_logs is the
 * catch-all for everything else (/api/inject 5xx, auth resolution failures,
 * upstream tool errors, anything where the host's logs aren't reliable
 * enough for post-incident forensics from our env).
 *
 * Table predates this schema file — created by raw SQL ahead of the Drizzle
 * model. This file documents the existing shape so callers can use the typed
 * insert helper in @/db/queries/debug-logs instead of raw SQL. Column names
 * MUST match the live table: meta (not context), no user_id.
 *
 * Source: short stable string identifying the call site ("api/inject",
 *         "api/control/dispatch", "auth").
 * Level:  "error" | "warn" | "info" — UI filters by this.
 * Meta:   free-form JSONB — request body shape, error stack, runtime info.
 */
export const debugLogs = pgTable("debug_logs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  source:    text("source").notNull(),
  level:     text("level").notNull(),
  message:   text("message").notNull(),
  meta:      jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_debug_logs_created_at").on(table.createdAt),
  index("idx_debug_logs_source").on(table.source),
]);

export type DebugLog    = typeof debugLogs.$inferSelect;
export type NewDebugLog = typeof debugLogs.$inferInsert;
