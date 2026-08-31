import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { userProjects } from "./user-projects";

/**
 * Atlas — what the fleet's public sites ACTUALLY look like from the outside.
 *
 * Deliberately separate from `user_projects.live_url`:
 *   live_url  = INTENT  — the user says "this project lives here" (SSOT, hand-edited)
 *   snapshot  = OBSERVATION — what a probe found there (derived, never hand-edited)
 *
 * Collapsing the two would let a stale observation masquerade as configuration:
 * a site that went down would read as "no URL configured", which is a different
 * problem with a different fix. One row per project — the latest observation.
 * History is not kept because nothing consumes it yet (YAGNI).
 */
export const siteSnapshots = pgTable(
  "site_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => userProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** The live_url as configured when this probe ran. */
    requestedUrl: text("requested_url").notNull(),
    /** Where redirects actually landed — a silent redirect to a parked page is a finding. */
    finalUrl: text("final_url"),

    statusCode: integer("status_code"),
    /** Reachable AND status < 400. Stored, not derived at read time, so the
     *  meaning of "up" is decided once at probe time. */
    ok: boolean("ok").notNull().default(false),
    responseMs: integer("response_ms"),

    /** Preview material, read from the site's own metadata — its canonical
     *  self-description, not our guess about it. */
    title: text("title"),
    description: text("description"),
    previewImageUrl: text("preview_image_url"),
    /** Whether that preview URL actually serves an image. NULL = none declared.
     *  Stored separately from the URL because "declares a preview" and "has a
     *  working preview" are different facts, and only the second one is what a
     *  link posted to Slack or Telegram will show. */
    previewOk: boolean("preview_ok"),

    /** Distinct external hosts this page links to. The synergy graph is built by
     *  intersecting these with the fleet's own hosts — observed connections, not
     *  declared ones, so the graph can say "nothing links here". */
    outboundHosts: jsonb("outbound_hosts").$type<string[]>().notNull().default([]),

    /** The site's own pages, read off its navigation. Self-maintaining: a page
     *  that ships appears on the next check, a page that goes away disappears. */
    internalPaths: jsonb("internal_paths").$type<string[]>().notNull().default([]),

    /** Populated only when the probe itself failed (DNS, TLS, timeout). */
    error: text("error"),

    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_site_snapshots_project").on(t.projectId),
    index("idx_site_snapshots_user").on(t.userId),
  ],
);

export type SiteSnapshot = typeof siteSnapshots.$inferSelect;
export type NewSiteSnapshot = typeof siteSnapshots.$inferInsert;
