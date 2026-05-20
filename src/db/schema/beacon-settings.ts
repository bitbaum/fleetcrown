import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const beaconSettings = pgTable("beacon_settings", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  userId:                uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  popupMode:             text("popup_mode").notNull().default("web"),
  countdownSeconds:      integer("countdown_seconds").notNull().default(12),
  minIdleSeconds:        integer("min_idle_seconds").notNull().default(0),
  whisperModel:          text("whisper_model").notNull().default("base"),
  transcriptionProvider: text("transcription_provider").notNull().default("auto"),
  // strategist | queue_only | next_best | off — drives handleAutoInject's
  // behavior. Defaults to strategist (Groq composes context-aware prompts).
  autoInjectMode:        text("auto_inject_mode").notNull().default("strategist"),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_beacon_settings_user_id").on(t.userId),
]);

export type BeaconSettingsRow    = typeof beaconSettings.$inferSelect;
export type NewBeaconSettingsRow = typeof beaconSettings.$inferInsert;
