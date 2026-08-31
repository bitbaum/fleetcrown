import { pgTable, uuid, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { users } from "./users";
import { entities } from "./entities";

/**
 * Agent turns reported by the agent itself, via Claude Code hooks.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * Control counted an agent as working only when FleetCrown dispatched the run
 * (a /tmp current-prompt sentinel backed by a /proc scan) or when the runner
 * saw a zellij tab named after a registered project. Sessions started any other
 * way — a terminal you opened, a background job, a worktree — produced neither
 * signal, so the fleet card read "0 working · 21 idle" while eight agents were
 * mid-task. The number was right about what it measured and wrong about the
 * fleet, which is the worst kind of right.
 *
 * The honest definition of "working" needs no tab and no /proc scan, because
 * the agent already announces both edges of its own turn:
 *
 *   UserPromptSubmit → a turn STARTS  (endedAt = NULL)
 *   Stop             → that turn ENDS (endedAt set)
 *
 * One row per agent session, updated in place. `endedAt IS NULL` means the
 * agent is working RIGHT NOW — the only claim in the system backed by the
 * agent's own report rather than by inference from a process table.
 *
 * A session that dies mid-turn (SIGKILL, crash, closed laptop) never sends its
 * Stop, so readers must ALSO bound on startedAt — see OPEN_TURN_TTL_MS in
 * queries/agent-sessions.ts. Without that bound one crash pins a project to
 * "working" forever, which is the failure mode the /tmp sentinel already had.
 */
export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The agent CLI's own session id — Claude Code's `session_id` hook field.
     *  Stable for the life of one session across many turns, which is what makes
     *  start and end correlatable without any state on the machine. */
    sessionId: text("session_id").notNull(),
    /** Resolved project name (same resolution as prompt_history.project_key, so
     *  a worktree under a project's directory reports as that project). */
    projectKey: text("project_key").notNull(),
    /** The session's actual cwd — a worktree path, not the project root. Kept so
     *  the UI can say WHICH checkout is busy when several are. */
    cwd: text("cwd").notNull(),
    projectId: uuid("project_id").references(() => entities.id, { onDelete: "set null" }),
    /** "claude" today. Present so a second agent CLI reporting turns does not
     *  need a schema change — and so the UI never has to guess. */
    agent: text("agent").notNull().default("claude"),
    /** When the CURRENT turn started. Overwritten on every new turn, so the TTL
     *  measures the running turn rather than the age of the session. */
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    /** NULL ⇒ working right now. Set by the Stop hook at the end of each turn
     *  and cleared again when the next turn starts. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One row per (user, session) — the upsert target. Without this a session
    // reporting a second turn would append instead of updating, and every
    // historical turn would read as a separate live agent.
    unique("uq_agent_sessions_user_session").on(table.userId, table.sessionId),
    index("idx_agent_sessions_user_id").on(table.userId),
    index("idx_agent_sessions_project_key").on(table.projectKey),
    // The hot read: open turns for one user, newest first.
    index("idx_agent_sessions_open").on(table.userId, table.endedAt, table.startedAt),
  ],
);

export type AgentSessionRow = typeof agentSessions.$inferSelect;
export type NewAgentSessionRow = typeof agentSessions.$inferInsert;
