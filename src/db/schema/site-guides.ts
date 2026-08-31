import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { userProjects } from "./user-projects";

/**
 * A guide is the answer to "how do I do X on this site" — an ordered list of
 * places to go and what to do when you get there.
 *
 * Distinct from the auto-discovered page map in `site_snapshots.internal_paths`,
 * and the two must not be merged. The map is OBSERVED and self-maintaining: it
 * answers "where can I go". A guide is AUTHORED and carries intent: it answers
 * "which three of those pages, in what order, and what do I click". Deriving one
 * from the other is impossible in both directions — a crawler cannot know the
 * task, and a task list cannot know what shipped yesterday.
 *
 * Steps are a jsonb array rather than a child table: they are only ever read and
 * written as a whole guide, never queried across guides, so a second table would
 * buy joins nobody performs.
 */
export type GuideStep = {
  /** What you are doing here — "Open the project you want to fund". */
  label: string;
  /** Site-relative path ("/projects/new") or absolute URL for an off-site hop. */
  path?: string;
  /** Optional detail: the button to press, the field to fill, the gotcha. */
  note?: string;
};

export const siteGuides = pgTable(
  "site_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => userProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    steps: jsonb("steps").$type<GuideStep[]>().notNull().default([]),
    position: integer("position").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_site_guides_project").on(t.projectId, t.position),
    index("idx_site_guides_user").on(t.userId),
  ],
);

export type SiteGuide = typeof siteGuides.$inferSelect;
export type NewSiteGuide = typeof siteGuides.$inferInsert;
