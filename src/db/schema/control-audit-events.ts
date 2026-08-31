import { pgTable, uuid, text, timestamp, jsonb, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

export const controlAuditEvents = pgTable(
  "control_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
    projectKey: text("project_key"),
    tabName: text("tab_name"),
    event: text("event").notNull(),
    source: text("source").notNull(),
    action: text("action").notNull(),
    decisionSource: text("decision_source"),
    reason: text("reason"),
    status: text("status"),
    health: text("health"),
    blockerCount: integer("blocker_count"),
    noOpCount: integer("no_op_count"),
    queueLength: integer("queue_length"),
    mode: text("mode"),
    promptHash: text("prompt_hash"),
    promptPreview: text("prompt_preview"),
    commandId: uuid("command_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_control_audit_user_time").on(table.userId, table.createdAt),
    index("idx_control_audit_user_project_time").on(
      table.userId,
      table.projectKey,
      table.createdAt,
    ),
    index("idx_control_audit_event_time").on(table.event, table.createdAt),
    index("idx_control_audit_action_time").on(table.action, table.createdAt),
  ],
);

export type ControlAuditEvent = typeof controlAuditEvents.$inferSelect;
export type NewControlAuditEvent = typeof controlAuditEvents.$inferInsert;
