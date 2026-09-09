-- Migration: Convert site_feedback.screenshot (text) to screenshots (jsonb array)
-- Add new screenshots column
ALTER TABLE "site_feedback" ADD COLUMN "screenshots" jsonb;

-- Migrate existing screenshot data to screenshots array
UPDATE "site_feedback" 
SET "screenshots" = jsonb_build_array("screenshot"::text)
WHERE "screenshot" IS NOT NULL;

-- Drop old screenshot column
ALTER TABLE "site_feedback" DROP COLUMN "screenshot";
