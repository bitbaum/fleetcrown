import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const invitations = pgTable("invitations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  token:     text("token").notNull().unique(),
  email:     text("email"),                                                   // optional pre-fill
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  usedBy:    uuid("used_by").references(() => users.id),
  usedAt:    timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_invitations_token").on(t.token),
  index("idx_invitations_created_by").on(t.createdBy),
]);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
