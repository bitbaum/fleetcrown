CREATE TABLE IF NOT EXISTS control_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  project_key text,
  tab_name text,
  event text NOT NULL,
  source text NOT NULL,
  action text NOT NULL,
  decision_source text,
  reason text,
  status text,
  health text,
  blocker_count integer,
  no_op_count integer,
  queue_length integer,
  mode text,
  prompt_hash text,
  prompt_preview text,
  command_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_audit_user_time
  ON control_audit_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_control_audit_user_project_time
  ON control_audit_events (user_id, project_key, created_at);

CREATE INDEX IF NOT EXISTS idx_control_audit_event_time
  ON control_audit_events (event, created_at);

CREATE INDEX IF NOT EXISTS idx_control_audit_action_time
  ON control_audit_events (action, created_at);
