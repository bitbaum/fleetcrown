-- Migration: add site_feedback.screenshots (jsonb array).
-- Keep the legacy screenshot text column. New writers use screenshots only.
-- Copy any existing single image into the array when the array is empty.

ALTER TABLE "site_feedback" ADD COLUMN IF NOT EXISTS "screenshots" jsonb;

UPDATE "site_feedback"
SET "screenshots" = jsonb_build_array("screenshot"::text)
WHERE "screenshot" IS NOT NULL
  AND ("screenshots" IS NULL OR "screenshots" = 'null'::jsonb OR "screenshots" = '[]'::jsonb);