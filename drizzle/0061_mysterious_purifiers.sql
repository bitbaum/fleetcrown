ALTER TABLE "prompt_history" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_run_id_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."orchestration_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_prompt_history_run_id" ON "prompt_history" USING btree ("run_id");