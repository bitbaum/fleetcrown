-- Migration: add site_feedback.screenshots (jsonb array) beside screenshot (text).
-- Do NOT drop screenshot. The box deploy gate refuses DROP COLUMN, and #537/#540
-- never reached the box because 0064 previously ended with a DROP.
-- App reads screenshots; leftover screenshot column is harmless.

ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "screenshots" jsonb;

UPDATE "site_feedback"
SET "screenshots" = jsonb_build_array("screenshot"::text)
WHERE "screenshot" IS NOT NULL
  AND ("screenshots" IS NULL OR "screenshots" = 'null'::jsonb OR "screenshots" = '[]'::jsonb);