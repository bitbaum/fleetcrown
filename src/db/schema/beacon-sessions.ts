import { pgTable, uuid, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// Beacon popup sessions — the L3 autopilot tier (Beacon) used to write one
// JSON file per session to /tmp/<APP_SLUG>-beacon/<id>.json and poll the
// directory every 150ms for SSE pushes. That worked but had three real
// drawbacks worth fixing:
//   - /tmp isn't durable; a server process restart loses pending
//     popups silently (rare in practice but the "lost popup" symptom is bad)
//   - Filesystem polling on every SSE tick is the kind of work the NOTIFY
//     event bus was added to obsolete (see drizzle/0022_notify_triggers.sql)
//   - Cross-instance reads are impossible — a popup written by one server
//     process is invisible to another. We never hit this because there's a
//     single user / single process path, but it's a latent landmine
//
// This table is the L3 product feature (beacon as the rung between Manual
// and Continuous in the autopilot ladder) given a proper backing store.
// The popup at /beacon/[id] still does the same thing; the storage just
// moves under it.
export const beaconSessions = pgTable("beacon_sessions", {
  id:               uuid("id").primaryKey().defaultRandom(),
  userId:           uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Project key / tab name the popup is associated with — usually the
   *  entity name. Indexed because cancelActiveBeaconSessions() filters by
   *  it on every direct injection. */
  project:          text("project").notNull(),
  /** Snapshot of the session.md handoff at popup creation time. Up to
   *  20KB (matches the file-based 20_000 char cap). */
  sessionContent:   text("session_content").notNull().default(""),
  /** "claude" / "codex" / etc. Snapshot of the agent that produced the
   *  handoff so the popup can render the right metadata. */
  currentAgent:     text("current_agent"),
  /** The agent the popup would switch to if the user picks "switch_agent"
   *  on capacity issues. Precomputed at session creation. */
  nextAgent:        text("next_agent"),
  /** Heuristic on the session content suggesting the run died because of
   *  agent capacity (rate limit, quota, etc.) — drives different popup copy. */
  capacityIssue:    boolean("capacity_issue").notNull().default(false),
  /** Countdown seconds — snapshotted from beacon_settings at creation
   *  so a settings change mid-popup doesn't shift the timer. */
  countdownSeconds: integer("countdown_seconds").notNull(),
  /** "web" or "disabled" — popup-mode snapshot. Mirrors the file shape. */
  popupMode:        text("popup_mode").notNull(),
  /** Optional metadata pin (current git branch at popup creation) — purely
   *  decorative on the popup; the file-based version had this and consumers
   *  read it, so we mirror the column. */
  gitBranch:        text("git_branch"),
  /** User's choice when they click a popup button OR the auto-pick that
   *  fires when the countdown reaches zero. NULL until the user (or timer)
   *  picks. Empty string ("") signals beacon was cancelled by a parallel
   *  injection — preserving the file-based contract. */
  choice:           text("choice"),
  createdAt:        timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
  /** When the row becomes irrelevant. PENDING_TTL_MS = 5 minutes from
   *  createdAt in the file-based version; we store the absolute expiry so
   *  the SSE route can WHERE-filter cleanly. */
  expiresAt:        timestamp("expires_at",  { withTimezone: true }).notNull(),
}, (table) => [
  index("idx_beacon_sessions_user_id").on(table.userId),
  index("idx_beacon_sessions_project").on(table.project),
  index("idx_beacon_sessions_pending").on(table.userId, table.choice, table.expiresAt),
]);

export type BeaconSessionRow = typeof beaconSessions.$inferSelect;
export type NewBeaconSession   = typeof beaconSessions.$inferInsert;
