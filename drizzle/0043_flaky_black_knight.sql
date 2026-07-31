ALTER TABLE "site_feedback" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "site_feedback" ADD COLUMN "duplicate_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_site_feedback_dedupe" ON "site_feedback" USING btree ("project_id","content_hash");--> statement-breakpoint
-- Backfill source from the legacy contact-string discriminators; everything
-- else was filed by a real visitor.
UPDATE "site_feedback" SET "source" = 'ai_review' WHERE "source" IS NULL AND "contact" = 'FleetCrown AI reviewer';--> statement-breakpoint
UPDATE "site_feedback" SET "source" = 'synthesizer' WHERE "source" IS NULL AND "contact" = 'FleetCrown synthesizer';--> statement-breakpoint
UPDATE "site_feedback" SET "source" = 'visitor' WHERE "source" IS NULL;
