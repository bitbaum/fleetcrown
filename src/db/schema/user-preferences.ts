import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userPreferences = pgTable("user_preferences", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  // Home base — permanent location
  homeCity:         text("home_city"),
  homeTimezone:     text("home_timezone"),
  homeLocale:       text("home_locale"),
  // Current location — overrides home while traveling
  currentCity:      text("current_city"),
  currentTimezone:  text("current_timezone"),
  currentCityUntil: date("current_city_until"),
  // Writing voice — free-text instruction layered on top of the house style
  // (docs/thoughts-style-guide.md) so AI-written content (Loki, essays) adopts
  // the user's preferred tone. Null = use the house default.
  writingVoice:     text("writing_voice"),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_user_preferences_user_id").on(t.userId),
]);

export type UserPreferencesRow    = typeof userPreferences.$inferSelect;
export type NewUserPreferencesRow = typeof userPreferences.$inferInsert;
