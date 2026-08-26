CREATE TABLE "human_task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"status" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"assignee_id" uuid,
	"project_id" uuid,
	"title" text NOT NULL,
	"brief" text,
	"reason" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" timestamp with time zone,
	"fee_amount" real,
	"fee_currency" text,
	"orangecat_service_id" text,
	"orangecat_url" text,
	"share_token" text,
	"shared_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"assigned_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "human_task_events" ADD CONSTRAINT "human_task_events_task_id_human_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."human_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_task_events" ADD CONSTRAINT "human_task_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_tasks" ADD CONSTRAINT "human_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_tasks" ADD CONSTRAINT "human_tasks_assignee_id_entities_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_tasks" ADD CONSTRAINT "human_tasks_project_id_entities_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_human_task_events_task" ON "human_task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_human_task_events_user" ON "human_task_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_human_tasks_user_id" ON "human_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_human_tasks_user_status" ON "human_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_human_tasks_assignee" ON "human_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_human_tasks_project" ON "human_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_human_tasks_due_date" ON "human_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_human_tasks_live_share_token" ON "human_tasks" USING btree ("share_token") WHERE share_token IS NOT NULL AND revoked_at IS NULL;