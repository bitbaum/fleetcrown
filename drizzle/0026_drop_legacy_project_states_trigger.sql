-- 0026 — drop legacy project_states_notify trigger + its function.
--
-- Pre-2026-06-07 inspection caught a duplicate trigger set on project_states:
--   * fc_notify_project_states (canonical — from 0022, fires on I/U/D, uses
--     the generic fc_emit_change function with TG_ARGV='user_id,project_key')
--   * project_states_notify (legacy — pre-rename, fires on I/U, calls a
--     standalone fleetcrown_notify_project_state function that emits a
--     different payload on the 'fleetcrown_state' channel)
--
-- Every UPDATE on project_states ran BOTH, doubling NOTIFY traffic on the
-- bridge and processing cost on every connected SSE subscriber. The canonical
-- fc_notify_project_states emits on 'fc:state' (the channel the bridge actually
-- listens on); the legacy one emits on 'fleetcrown_state' which nothing
-- subscribes to anymore — wasted work both sides.
--
-- This migration:
--   1. DROP the legacy trigger
--   2. DROP the legacy function it called
-- No data is touched. fc_notify_project_states keeps doing its job alone.
--
-- Safe to re-run (uses IF EXISTS).

DROP TRIGGER IF EXISTS project_states_notify ON project_states;
DROP FUNCTION IF EXISTS fleetcrown_notify_project_state();
