-- What the day's AI tokens were spent ON: provider, model, and the feature that
-- asked. `ai_spend` stays the per-user rationing ledger and is untouched; this
-- answers the orthogonal question the capacity page needs.
CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"feature" text NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The upsert target. Without it two concurrent calls both read zero, both
-- insert, and the day reports twice the rows at half the truth each.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_usage_bucket" ON "ai_usage" USING btree ("day","provider","model","feature");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_usage_day" ON "ai_usage" USING btree ("day");
