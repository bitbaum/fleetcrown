import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per zellij pane the daemon observed in the last heartbeat. Used by
 * Fleet Runner cold-start to regenerate a KDL layout that respawns each agent
 * in the correct tab + cwd, so the user never types `claude` after a restart.
 *
 * Per-pane (not per-tab) so the "two panes in one tab" case round-trips.
 */
export type PaneRecord = {
  /** Zellij tab name (already used as project key in user_projects.name). */
  tab: string;
  /** 0..N within the tab. Determines pane order in the regenerated layout. */
  paneIndex: number;
  /** Agent CLI id ("claude" | "codex" | "cursor" | "gemini" | "grok"). Undefined = shell pane. */
  agentCli?: string;
  /** Working directory of the pane (from /proc/<pid>/cwd cross-ref). */
  cwd?: string;
  /** Zellij session that owned this pane. Defaults to "fleet" if absent. */
  sessionName?: string;
};

/** Latest Zellij tab list pushed by the local daemon (cloud control plane). */
export const runtimeSnapshots = pgTable("runtime_snapshots", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  openTabs: text("open_tabs").array().notNull().default([]),
  installedAgents: text("installed_agents").array().notNull().default([]),
  /**
   * Per-pane topology. SSOT for Fleet Runner's cold-start restore path: the
   * latest snapshot's panes IS the "desired state" we regenerate from. Empty
   * array means no panes observed (legacy snapshots upgrade transparently).
   */
  panes: jsonb("panes").$type<PaneRecord[]>().notNull().default([]),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RuntimeSnapshot = typeof runtimeSnapshots.$inferSelect;
export type NewRuntimeSnapshot = typeof runtimeSnapshots.$inferInsert;
