-- v0.6 — Postgres LISTEN/NOTIFY event bus
--
-- The web UI and desktop renderer used to poll /api/control every 30s.
-- v0.6 inverts that: clients subscribe to a single SSE stream served by
-- the bridge process (see ./bridge), and the bridge LISTENs on 'fc:state'
-- here in Postgres. Whenever a row that matters to a user's dashboard
-- changes, a trigger on that table emits a NOTIFY that flows through the
-- bridge to every connected client owned by that user.
--
-- Payload shape (kept under 8KB to satisfy Postgres's NOTIFY limit):
--   {
--     "t": "project_states",     -- short table key
--     "u": "<user_uuid>",        -- which user owns this change (routing)
--     "k": "<row identifier>",   -- enough to identify the row (project_key, snapshot id, etc.)
--     "op": "INSERT|UPDATE|DELETE",
--     "ts": 1733332332            -- emit time, seconds since epoch
--   }
--
-- Clients re-fetch the changed row themselves if they need full content.
-- The bus only carries "something changed here" signals — that decouples
-- the bus's bandwidth from the row size and avoids needing to mirror
-- column-level update logic in the trigger.
--
-- Channel name: 'fc:state' (one channel for all change events). Per-table
-- channels would force the bridge to LISTEN on N channels and add little
-- value — fanout per user is the relevant routing dimension, not per table.

-- ── Shared NOTIFY function ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fc_emit_change()
RETURNS TRIGGER AS $$
DECLARE
  user_id_value text;
  key_value text;
  payload jsonb;
BEGIN
  -- Each trigger passes the column names for user_id and the row key via
  -- TG_ARGV. e.g. CREATE TRIGGER ... EXECUTE FUNCTION fc_emit_change('user_id', 'project_key');
  -- This keeps the function generic across tables with different identifier columns.
  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT ($1).%I::text, ($1).%I::text', TG_ARGV[0], TG_ARGV[1])
      USING OLD INTO user_id_value, key_value;
  ELSE
    EXECUTE format('SELECT ($1).%I::text, ($1).%I::text', TG_ARGV[0], TG_ARGV[1])
      USING NEW INTO user_id_value, key_value;
  END IF;

  -- Silently skip rows with no user_id — system tables with shared rows
  -- (none today, but future-proof). The bridge has no one to route to.
  IF user_id_value IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  payload := jsonb_build_object(
    't',  TG_TABLE_NAME,
    'u',  user_id_value,
    'k',  key_value,
    'op', TG_OP,
    'ts', extract(epoch from now())::bigint
  );

  -- pg_notify is safe inside triggers; takes (channel, payload) as text.
  -- Wrapped in a perform so the value is discarded.
  PERFORM pg_notify('fc:state', payload::text);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fc_emit_change() IS
  'Trigger function: emits a NOTIFY on channel fc:state with the user_id + row key for any row change. TG_ARGV: [user_id_column, row_key_column].';

-- ── Triggers on tables the UI cares about ─────────────────────────────────

-- project_states — the per-project dashboard rows (the single biggest
-- driver of /api/control polling traffic). Row key is project_key, which
-- is unique per user.
DROP TRIGGER IF EXISTS fc_notify_project_states ON project_states;
CREATE TRIGGER fc_notify_project_states
  AFTER INSERT OR UPDATE OR DELETE ON project_states
  FOR EACH ROW EXECUTE FUNCTION fc_emit_change('user_id', 'project_key');

-- runtime_snapshots — daemon heartbeat / open-tabs snapshot. One row per
-- user is the typical shape (the table is keyed by user_id), so the row
-- key is also user_id; that's fine, the client treats it as "the user's
-- snapshot changed."
DROP TRIGGER IF EXISTS fc_notify_runtime_snapshots ON runtime_snapshots;
CREATE TRIGGER fc_notify_runtime_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON runtime_snapshots
  FOR EACH ROW EXECUTE FUNCTION fc_emit_change('user_id', 'user_id');

-- pending_commands — cloud-dispatched commands queued for a daemon. New
-- rows here mean "a daemon should run this." When the daemon clears the
-- row (sets executed_at), the same trigger fires and the web UI knows
-- the dispatch completed.
DROP TRIGGER IF EXISTS fc_notify_pending_commands ON pending_commands;
CREATE TRIGGER fc_notify_pending_commands
  AFTER INSERT OR UPDATE OR DELETE ON pending_commands
  FOR EACH ROW EXECUTE FUNCTION fc_emit_change('user_id', 'id');

-- orchestration_runs — historical record of dispatches. Used by the
-- "recent runs" panel on /today and /control. Lower-volume than the
-- others but the UI shows it live.
DROP TRIGGER IF EXISTS fc_notify_orchestration_runs ON orchestration_runs;
CREATE TRIGGER fc_notify_orchestration_runs
  AFTER INSERT OR UPDATE OR DELETE ON orchestration_runs
  FOR EACH ROW EXECUTE FUNCTION fc_emit_change('user_id', 'id');

-- beacon_settings — per-user autopilot configuration. Changes rarely
-- (when the user flips Manual/Autonomous/etc.) but the UI should reflect
-- the change instantly across all open surfaces.
DROP TRIGGER IF EXISTS fc_notify_beacon_settings ON beacon_settings;
CREATE TRIGGER fc_notify_beacon_settings
  AFTER INSERT OR UPDATE OR DELETE ON beacon_settings
  FOR EACH ROW EXECUTE FUNCTION fc_emit_change('user_id', 'user_id');

-- Future: add more tables here as the live surface grows. The trigger
-- pattern is two lines per table — drop + create with the user_id and
-- row_key column names — no Python or Node deploy needed.
