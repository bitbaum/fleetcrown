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
  // behavior. Defaults to queue_only: new users must explicitly opt into
  // autonomous loops via /control settings. Flipped from "strategist" on
  // 2026-05-25 after the prompt-design conversation identified that
  // autonomous strategist firing on day one was a closed-loop drift risk
  // every new customer inherited (see Cockpit.roadmap.md DONE entry).
  autoInjectMode:        text("auto_inject_mode").notNull().default("queue_only"),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_beacon_settings_user_id").on(t.userId),
]);

export type BeaconSettingsRow    = typeof beaconSettings.$inferSelect;
export type NewBeaconSettingsRow = typeof beaconSettings.$inferInsert;
