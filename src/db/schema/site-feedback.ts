import { pgTable, uuid, text, jsonb, timestamp, index, integer } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";
import { widgetTokens } from "./widget-tokens";
import {
  FEEDBACK_STATUS,
  type FeedbackStatus,
  type FeedbackScope,
  type FeedbackSource,
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
export const siteFeedback = pgTable(
  "site_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    /** Project owner — denormalized so inbox queries skip the entities join. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenId: uuid("token_id").references(() => widgetTokens.id, { onDelete: "set null" }),

    suggestion: text("suggestion").notNull(),
    /** Optional name/email the visitor left for follow-up. */
    contact: text("contact"),
    /**
     * The reporter's email, lowercased — derived from `contact` when it parses
     * as one (see lib/feedback/submitter.ts). Kept in its own column because
     * `contact` is free text and half of it is names: matching a report to the
     * account that later registers needs a field that is only ever an address.
     *
     * NOTE the two user columns on this table point in OPPOSITE directions.
     * `userId` above is the project OWNER — who RECEIVES this. The two below
     * are who SENT it. Confusing them leaks one person's inbox into another's.
     */
    submitterEmail: text("submitter_email"),
    /** The Loki account that filed this, once bound. Two ways in, both in
     *  lib/feedback/claim.ts: opening the track link while signed in
     *  (possession of the token is the proof), or registering with a VERIFIED
     *  email that matches submitterEmail. Never set from an unverified match. */
    submitterUserId: uuid("submitter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Unguessable follow token, minted for every row at ingest and handed
     * straight back to the widget. It is the whole reason a visitor can watch
     * their own report without an account: /f/<token> reads by this alone.
     *
     * Nullable for the rows that predate it — they simply have no public page,
     * which is honest. Never derive it from anything about the row; it is a
     * capability, and a guessable one would hand strangers other people's
     * reports (including the contact email on them).
     */
    trackToken: text("track_token").unique(),
    page: text("page"),
    url: text("url"),
    pageTitle: text("page_title"),
    scope: text("scope").$type<FeedbackScope>(),
    selectedElements: jsonb("selected_elements").$type<FeedbackSelectedElement[]>(),
    userAgent: text("user_agent"),
    /** Who filed it (visitor | ai_review | synthesizer). Null = legacy row =
     *  visitor. Synthesizer rows are aggregate briefs — excluded from digester
     *  clustering and from close-the-loop email. */
    source: text("source").$type<FeedbackSource>(),
    /** sha256 over normalized (suggestion + page) — the ingest dedupe key.
     *  A repeat submission increments duplicateCount instead of a new row. */
    contentHash: text("content_hash"),
    duplicateCount: integer("duplicate_count").notNull().default(1),
    /** Optional visitor-attached images as jpeg/png/webp data URLs (≤600k chars each,
     *  client-downscaled, max 5). EXCLUDED from list queries — fetched only via
     *  GET /api/feedback/[id]/screenshots. */
    screenshots: jsonb("screenshots").$type<string[]>(),
    /** Operator curation for the public "shipped thanks to feedback" strip —
     *  only featured resolved rows ever surface publicly (raw visitor text
     *  never auto-publishes). */
    featuredAt: timestamp("featured_at", { withTimezone: true }),

    status: text("status").$type<FeedbackStatus>().notNull().default(FEEDBACK_STATUS.NEW),
    /** Orchestration run created when the operator dispatched a fix for this item. */
    dispatchedRunId: uuid("dispatched_run_id"),
    /** When the item was resolved (close-the-loop or manual). Cleared on reopen —
     *  together with dispatchedRunId this is the row's resolution evidence. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_site_feedback_project").on(t.projectId, t.status),
    index("idx_site_feedback_user").on(t.userId, t.status),
    index("idx_site_feedback_dedupe").on(t.projectId, t.contentHash),
    // The "reports I sent" list: both halves of the claim rule, each indexed,
    // because the Sent view matches on either (bound account OR verified email).
    index("idx_site_feedback_submitter").on(t.submitterUserId, t.createdAt),
    index("idx_site_feedback_submitter_email").on(t.submitterEmail),
  ],
);

export type SiteFeedback = typeof siteFeedback.$inferSelect;
export type NewSiteFeedback = typeof siteFeedback.$inferInsert;
