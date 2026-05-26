-- Diagnostics storage used by authentication and control-plane error logging.
-- Idempotent because production instances may have created this table manually.

CREATE TABLE IF NOT EXISTS debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  level text NOT NULL,
  message text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at
  ON debug_logs (created_at);

CREATE INDEX IF NOT EXISTS idx_debug_logs_source
  ON debug_logs (source);
