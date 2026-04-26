import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Shape of the JSONB `payload` column on actions — the union of fields
 *  Ivy fills in for each action type. Exported so render code can pick
 *  it up via the schema rather than re-declaring `Record<string,unknown>`. */
export type ActionPayload = {
  // For messages:
  to?: string;          // recipient name or ID
  channel?: string;     // whatsapp, telegram, email
  body?: string;        // message text
  subject?: string;     // email subject
  // For events:
  eventTitle?: string;
  eventDate?: string;
  eventLocation?: string;
  // For commitments:
  commitment?: string;
  dueDate?: string;
  // Generic:
  [key: string]: unknown;
};

/**
 * Action Queue — Ivy's hands.
 *
 * IRON RULE: Nothing with status 'draft' ever executes.
 * Only 'approved' actions are executed. George must review every draft.
 * Status flow: draft → approved → executed (or draft → rejected)
 * There is no auto-approve. There is no bypass.
 */
export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),

  // What kind of action
  type: text("type").notNull(),
  // send_message, send_email, create_event, create_commitment, follow_up, other

  // Workflow status — the critical field
  status: text("status").notNull().default("draft"),
  // draft     = Ivy proposes, George hasn't seen it yet
  // approved  = George said yes, ready to execute
  // executed  = Done, action was taken
  // rejected  = George said no
  // expired   = Too old, no longer relevant

  // What Ivy wants to do
  title: text("title").notNull(),
  description: text("description"),

  // The actual content (message body, event details, etc.)
  payload: jsonb("payload").$type<ActionPayload>(),

  // Why Ivy thinks this action is needed
  reasoning: text("reasoning"),

  // Link to related entity (person, project, etc.)
  entityId: uuid("entity_id"),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (table) => [
  index("idx_actions_user_id").on(table.userId),
  index("idx_actions_status").on(table.status),
  index("idx_actions_type").on(table.type),
  index("idx_actions_created_at").on(table.createdAt),
]);

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
