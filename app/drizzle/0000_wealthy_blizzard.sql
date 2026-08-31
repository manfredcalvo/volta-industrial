CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"value" text NOT NULL,
	"rationale" text,
	"trace_id" text,
	"mlflow_assessment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."line_status" (
	"id" text PRIMARY KEY NOT NULL,
	"line_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"line_name" text NOT NULL,
	"plant_name" text,
	"region" text,
	"failure_risk_score" double precision NOT NULL,
	"downtime_exposure_usd" double precision NOT NULL,
	"current_status" text NOT NULL,
	"last_check_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."maintenance_recommendations" (
	"line_id" text PRIMARY KEY NOT NULL,
	"recommended_action" text NOT NULL,
	"predicted_downtime_cost_usd" double precision,
	"action_ranking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"position" integer NOT NULL,
	"trace_id" text,
	"thinking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"canceled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."open_atrisk" (
	"line_id" text PRIMARY KEY NOT NULL,
	"plant_id" text NOT NULL,
	"line_name" text NOT NULL,
	"failure_risk_score" double precision NOT NULL,
	"downtime_exposure_usd" double precision NOT NULL,
	"part_local" boolean NOT NULL,
	"candidate_part_id" text,
	"part_lead_time_days" integer
);
--> statement-breakpoint
CREATE TABLE "app"."parts" (
	"id" text PRIMARY KEY NOT NULL,
	"part_id" text NOT NULL,
	"part_name" text NOT NULL,
	"part_category" text,
	"description" text,
	"part_local" boolean NOT NULL,
	"lead_time_days" integer,
	"unit_cost_usd" double precision
);
--> statement-breakpoint
CREATE TABLE "app"."work_orders_app" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" text NOT NULL,
	"action_type" text NOT NULL,
	"part_id" text,
	"drafted_wo" text NOT NULL,
	"predicted_downtime_cost_avoided_usd" double precision,
	"status" text DEFAULT 'drafted' NOT NULL,
	"approved_by" text,
	"audit_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app"."feedback" ADD CONSTRAINT "feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "app"."conversations" USING btree ("user_email","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_kind_idx" ON "app"."conversations" USING btree ("user_email","kind");--> statement-breakpoint
CREATE INDEX "feedback_message_idx" ON "app"."feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "line_status_risk_idx" ON "app"."line_status" USING btree ("failure_risk_score");--> statement-breakpoint
CREATE INDEX "line_status_plant_idx" ON "app"."line_status" USING btree ("plant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_convo_pos_uq" ON "app"."messages" USING btree ("conversation_id","position");--> statement-breakpoint
CREATE INDEX "open_atrisk_risk_idx" ON "app"."open_atrisk" USING btree ("failure_risk_score");--> statement-breakpoint
CREATE INDEX "open_atrisk_plant_idx" ON "app"."open_atrisk" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "parts_part_id_idx" ON "app"."parts" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "parts_local_idx" ON "app"."parts" USING btree ("part_local");--> statement-breakpoint
CREATE INDEX "work_orders_line_idx" ON "app"."work_orders_app" USING btree ("line_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "app"."work_orders_app" USING btree ("status");