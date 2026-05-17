import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

export const ORG_ROLE_VALUES = ["owner", "admin", "member"] as const;
export type OrgRole = typeof ORG_ROLE_VALUES[number];

export const orgs = pgTable("orgs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  slug:      text("slug").notNull().unique(),
  ownerId:   uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("idx_orgs_owner_id").on(t.ownerId),
]);

export const orgMemberships = pgTable("org_memberships", {
  id:        uuid("id").primaryKey().defaultRandom(),
  orgId:     uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role:      text("role").$type<OrgRole>().notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("uq_org_memberships_org_user").on(t.orgId, t.userId),
  index("idx_org_memberships_org_id").on(t.orgId),
  index("idx_org_memberships_user_id").on(t.userId),
]);

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type NewOrgMembership = typeof orgMemberships.$inferInsert;
