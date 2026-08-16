import { pgTable, uuid, text, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import type { RunnerChannel } from "./pending-commands";

/**
 * One row per zellij pane the runner observed in the last heartbeat. Used by
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

/** Latest Zellij tab list pushed by the local runner (cloud control plane). */
export const runtimeSnapshots = pgTable("runtime_snapshots", {
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel").$type<RunnerChannel>().notNull().default("local"),
  openTabs: text("open_tabs").array().notNull().default([]),
  installedAgents: text("installed_agents").array().notNull().default([]),
  runnerVersion: text("runner_version"),
  /**
   * Per-pane topology. SSOT for Fleet Runner's cold-start restore path: the
   * latest snapshot's panes IS the "desired state" we regenerate from. Empty
   * array means no panes observed (legacy snapshots upgrade transparently).
   */
  panes: jsonb("panes").$type<PaneRecord[]>().notNull().default([]),
  /**
   * Wall power vs battery, as the runner last observed it.
   *
   * Not trivia — it is the only signal that says whether this builder will
   * still exist in twenty minutes. A laptop on wall power stays awake (its lid
   * action is "do nothing" on AC); the same laptop on battery sleeps the moment
   * the lid shuts and dies when the charge runs out. Dispatching a long agent
   * run to it from a phone is a coin flip.
   *
   * NULLABLE, and null means UNKNOWN — never "battery". Runners predating this
   * field report nothing, and demoting them would silently stop every
   * un-upgraded desktop from receiving work (fatal for accounts with no cloud
   * builder to fall back to). Routing may only act on positive knowledge.
   *
   * Freshness comes free: this rides the same row as `observedAt`, so a stale
   * "ac" expires with the heartbeat instead of vouching for a sleeping laptop.
   */
  powerSource: text("power_source").$type<"ac" | "battery">(),
  observedAt: timestamp("observed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.channel] }),
]);

export type RuntimeSnapshot = typeof runtimeSnapshots.$inferSelect;
export type NewRuntimeSnapshot = typeof runtimeSnapshots.$inferInsert;
