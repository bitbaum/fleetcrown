-- User-owned prompt library — Prompt Library v2.1.
--
-- The 41 FleetCrown default prompts stay in src/config/prompt-library.ts.
-- This table is for user-created and project-/org-scoped prompts. The
-- /prompts page merges both sources at render time.
--
-- Variables: bodies use {{name}} or {{name|default}} placeholders. The
-- variables JSONB column is the declared SSOT — run-time UI renders inputs
-- per entry without re-parsing the body.
--
-- Mirrors src/db/schema/prompts.ts.

CREATE TABLE IF NOT EXISTS prompts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  body             TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'global',
  project_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  org_id           UUID REFERENCES orgs(id) ON DELETE CASCADE,
  tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables        JSONB NOT NULL DEFAULT '[]'::jsonb,
  source           TEXT NOT NULL DEFAULT 'user',
  forked_from_key  TEXT,
  run_count        INTEGER NOT NULL DEFAULT 0,
  success_count    INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompts_user_id     ON prompts (user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_project_id  ON prompts (project_id);
CREATE INDEX IF NOT EXISTS idx_prompts_scope       ON prompts (scope);
CREATE INDEX IF NOT EXISTS idx_prompts_active      ON prompts (user_id, is_active);
