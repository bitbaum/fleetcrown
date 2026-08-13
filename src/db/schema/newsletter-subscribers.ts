import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Newsletter subscribers — capture-only email list for the Thoughts essays
 * ("Get new essays by email"). No sending pipeline exists yet by design;
 * this table is the SSOT of who asked, from where, and when.
 *
 * `email` is stored normalized (lowercased at the single write path in
 * db/queries/newsletter-subscribers.ts) so the plain unique constraint is
 * effectively case-insensitive. `source` records the capture surface
 * ("thoughts-index" or an essay slug) so we can later see which essays
 * convert. Re-subscribing is a no-op, never an error.
 */
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /** Where the signup happened: "thoughts-index" or an essay slug. */
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewNewsletterSubscriber = typeof newsletterSubscribers.$inferInsert;
