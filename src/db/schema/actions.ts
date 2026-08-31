import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { ACTION_STATUS, type ActionStatus, type ActionType } from "@/lib/constants/statuses";

/** Shape of the JSONB `payload` column on actions — the union of fields
 *  Loki fills in for each action type. Exported so render code can pick
 *  it up via the schema rather than re-declaring `Record<string,unknown>`. */
export type ActionPayload = {
  // For messages:
  to?: string; // recipient name or ID
  channel?: string; // whatsapp, telegram, email
  body?: string; // message text
  subject?: string; // email subject
  // For events (create_event). Loki fills what it knows; the executor is lenient:
  //   - eventStart/eventEnd: explicit RFC3339 instants (preferred, precise).
  //   - eventDate: a fallback when only a day is known — YYYY-MM-DD ⇒ all-day,
  //     or a full datetime ⇒ a 1-hour block from that instant.
  //   - allDay: force an all-day event regardless of the above.
  eventTitle?: string;
  eventDate?: string;
  eventStart?: string;
  eventEnd?: string;
  eventLocation?: string;
  allDay?: boolean;
  // For commitments:
  commitment?: string;
  dueDate?: string;
  // For Loki profile updates (OTHER + kind=profile_update):
  kind?: string;
  projectKey?: string;
  fieldKey?: string;
  value?: string;
  // Generic:
  [key: string]: unknown;
};

/**
 * Action Queue — Loki's hands.
 *
 * IRON RULE: Nothing with status 'draft' ever executes.
 * Only 'approved' actions are executed. the operator must review every draft.
 * Status flow: draft → approved → executed (or draft → rejected)
 * There is no auto-approve. There is no bypass.
 */
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),

    // What kind of action — see ACTION_TYPE in lib/constants/statuses
    type: text("type").$type<ActionType>().notNull(),

    // Workflow status — the critical field
    status: text("status").$type<ActionStatus>().notNull().default(ACTION_STATUS.DRAFT),
    // draft     = Loki proposes, the operator hasn't seen it yet
    // approved  = the operator said yes, ready to execute
    // executed  = Done, action was taken
    // rejected  = the operator said no
    // expired   = Too old, no longer relevant

    // What Loki wants to do
    title: text("title").notNull(),
    description: text("description"),

    // The actual content (message body, event details, etc.)
    payload: jsonb("payload").$type<ActionPayload>(),

    // Why Loki thinks this action is needed
    reasoning: text("reasoning"),

    // Link to related entity (person, project, etc.)
    entityId: uuid("entity_id"),

    // Execution lease — NOT a status.
    //
    // An approved action still has to be carried out by a runtime that owns the
    // hands for it (calendar events need `gog`, which lives only on the operator's
    // machine). The drain seam handed the same approved row to every caller that
    // asked, so a second drain instance would book the event a second time. This
    // column is the claim: a drain takes the row, and only rows that are unclaimed
    // — or whose claim has gone stale, because the drain died mid-booking — are
    // handed out again. The status enum is untouched; the IRON RULE still says
    // only 'approved' executes. This is who is doing it right now, not what it is.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_actions_user_id").on(table.userId),
    index("idx_actions_status").on(table.status),
    index("idx_actions_type").on(table.type),
    index("idx_actions_created_at").on(table.createdAt),
    // Prevent Loki from queuing a second draft for the same action title.
    // Once approved/rejected/executed the title is free to reappear.
    uniqueIndex("idx_actions_unique_draft_title")
      .on(table.userId, table.title)
      .where(sql`status = 'draft'`),
  ],
);

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
