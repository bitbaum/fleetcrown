-- Reaffirm the autopilot default. The auto_inject_mode column default was
-- flipped to 'queue_only' at the application layer on 2026-05-25 as a
-- defensive measure against day-one autonomous strategist firing. With
-- /control's state model now trustworthy (commits 6da8d7e + 7d7c40a) and
-- the Stop hook re-architected to call /api/control/dispatch directly,
-- the default returns to 'strategist' — Cockpit's product promise is
-- autopilot, and the safety rails (manual override, health gate, hard_stop,
-- queue priority) are in the dispatch path itself.
--
-- This migration:
--   1. Sets the column DEFAULT to 'strategist' so NEW user rows land in
--      autopilot without any seed.
--   2. Does NOT touch existing rows — users who explicitly chose
--      'queue_only' / 'off' keep that choice.
--   3. Is idempotent.

ALTER TABLE "beacon_settings"
  ALTER COLUMN "auto_inject_mode" SET DEFAULT 'strategist';
