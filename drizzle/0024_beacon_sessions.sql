-- Beacon popup sessions — Change 4.
--
-- Replaces the /tmp/<APP_SLUG>-beacon/<id>.json file-based store the L3
-- autopilot tier used. Same data shape, but durable across function
-- restarts, queryable cross-pod, and amenable to the LISTEN/NOTIFY event
-- bus (a follow-up trigger on this table will obsolete the 150ms SSE
-- polling loop in /api/beacon/sse).
--
-- Mirrors src/db/schema/beacon-sessions.ts. The pending-popup composite
-- index covers the /beacon/[id]/page.tsx SSR-preload query
-- (user_id + choice IS NULL + expires_at > now()).

CREATE TABLE IF NOT EXISTS beacon_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project            TEXT NOT NULL,
  session_content    TEXT NOT NULL DEFAULT '',
  current_agent      TEXT,
  next_agent         TEXT,
  capacity_issue     BOOLEAN NOT NULL DEFAULT false,
  countdown_seconds  INTEGER NOT NULL,
  popup_mode         TEXT NOT NULL,
  git_branch         TEXT,
  choice             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_beacon_sessions_user_id ON beacon_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_beacon_sessions_project ON beacon_sessions (project);
CREATE INDEX IF NOT EXISTS idx_beacon_sessions_pending ON beacon_sessions (user_id, choice, expires_at);
