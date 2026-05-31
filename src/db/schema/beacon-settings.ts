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
  // off | queue_only | beacon | next_best | strategist — the five-level
  // autopilot trust ladder (Manual / Queue / Beacon / Continuous / Mission).
  // Default is "beacon" (L3): popup with smart choices + countdown auto-pick
  // when the agent finishes. Right starting trust level — new users see
  // every dispatch through a popup before opting into Continuous (L4) or
  // Mission (L5). Was "strategist" (L5) until 2026-05-31 — flipped after
  // user feedback that L5 felt like a loose cannon (composed AI prompts
  // fired without consent step). Safety rails (status:working gate,
  // pending-blocker gate) apply at every level above off.
  autoInjectMode:        text("auto_inject_mode").notNull().default("beacon"),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_beacon_settings_user_id").on(t.userId),
]);

export type BeaconSettingsRow    = typeof beaconSettings.$inferSelect;
export type NewBeaconSettingsRow = typeof beaconSettings.$inferInsert;
