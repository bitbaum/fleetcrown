import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { widgetTokens } from "./widget-tokens";
import {
  FEEDBACK_STATUS,
  type FeedbackStatus,
  type FeedbackScope,
} from "@/lib/constants/statuses";

/** One element captured by the widget's element-scope picker. */
export type FeedbackSelectedElement = {
  elementType: string;
  elementText: string;
  selector: string;
};

/**
 * Site feedback — visitor submissions from the embeddable feedback widget.
 * Persist-first: this insert is the channel that never silently drops;
 * notifications/UI are derived from it, not written alongside it.
 *
 * Status flow mirrors the action queue's philosophy — nothing auto-dispatches,
 * the operator triages: new → dispatched → resolved, or new → archived.
 */
export const siteFeedback = pgTable("site_feedback", {
  id:        uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  /** Project owner — denormalized so inbox queries skip the entities join. */
  userId:    uuid("user_id").notNull().references(() => users.id),
  tokenId:   uuid("token_id").references(() => widgetTokens.id, { onDelete: "set null" }),

  suggestion: text("suggestion").notNull(),
  /** Optional name/email the visitor left for follow-up. */
  contact:    text("contact"),
  page:       text("page"),
  url:        text("url"),
  pageTitle:  text("page_title"),
  scope:      text("scope").$type<FeedbackScope>(),
  selectedElements: jsonb("selected_elements").$type<FeedbackSelectedElement[]>(),
  userAgent:  text("user_agent"),

  status: text("status").$type<FeedbackStatus>().notNull().default(FEEDBACK_STATUS.NEW),
  /** Orchestration run created when the operator dispatched a fix for this item. */
  dispatchedRunId: uuid("dispatched_run_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_site_feedback_project").on(t.projectId, t.status),
  index("idx_site_feedback_user").on(t.userId, t.status),
]);

export type SiteFeedback = typeof siteFeedback.$inferSelect;
export type NewSiteFeedback = typeof siteFeedback.$inferInsert;
