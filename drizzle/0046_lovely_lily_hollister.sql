ALTER TABLE "orchestration_runs" ADD COLUMN "tokens_in" bigint;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "tokens_out" bigint;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "tokens_cache_read" bigint;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "tokens_cache_write" bigint;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "usage_detail" jsonb;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "usage_updated_at" timestamp with time zone;