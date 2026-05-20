-- Add auto_inject_mode to beacon_settings so users can opt out of the
-- strategist-composed auto-inject (default new behavior) and pick a
-- mode that fits their workflow:
--
--   strategist  — DEFAULT: queue head → COMPOSED body → next_best fallback
--   queue_only  — only fire queue items; never auto-compose or next_best
--   next_best   — legacy: skip strategist call, fire canned template
--   off         — disable auto-inject entirely (user must dispatch by hand)
--
-- Default value is 'strategist' for both new and existing users — the
-- new behavior is the intended product direction; users who prefer the
-- old ladder can flip this to 'next_best' explicitly.
--
-- Idempotent — re-runs without error.

ALTER TABLE "beacon_settings"
  ADD COLUMN IF NOT EXISTS "auto_inject_mode" text NOT NULL DEFAULT 'strategist';
