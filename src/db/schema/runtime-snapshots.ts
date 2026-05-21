import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Latest Zellij tab list pushed by the local daemon (cloud control plane). */
export const runtimeSnapshots = pgTable("runtime_snapshots", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  openTabs: text("open_tabs").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RuntimeSnapshot = typeof runtimeSnapshots.$inferSelect;
export type NewRuntimeSnapshot = typeof runtimeSnapshots.$inferInsert;
