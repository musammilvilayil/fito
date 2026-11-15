CREATE TYPE "public"."ai_generation_status" AS ENUM('succeeded', 'failed', 'invalid_output', 'fallback', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."attendance_method" AS ENUM('qr', 'manual');--> statement-breakpoint
CREATE TYPE "public"."duration_unit" AS ENUM('days', 'months');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other', 'undisclosed');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."membership_kind" AS ENUM('new', 'renewal');--> statement-breakpoint
CREATE TYPE "public"."membership_state" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'card', 'bank_transfer', 'online');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('completed', 'pending', 'failed', 'void');--> statement-breakpoint
CREATE TYPE "public"."workout_plan_source" AS ENUM('ai', 'template', 'manual');--> statement-breakpoint
CREATE TYPE "public"."workout_plan_status" AS ENUM('draft', 'pending_review', 'active', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'trainer', 'receptionist');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid,
	"requested_by_staff_id" uuid,
	"provider" text NOT NULL,
	"model" text,
	"status" "ai_generation_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"validation_errors" jsonb,
	"error_message" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"check_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"check_in_date" date NOT NULL,
	"check_out_at" timestamp with time zone,
	"method" "attendance_method" NOT NULL,
	"override_reason" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"gym_id" uuid NOT NULL,
	"name" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "counters_gym_id_name_pk" PRIMARY KEY("gym_id","name")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"gym_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"equipment" text NOT NULL,
	"level" text NOT NULL,
	"mechanic" text,
	"force" text,
	"primary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}'::text[] NOT NULL,
	"instructions" text[] DEFAULT '{}'::text[] NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_url" text,
	"risk_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"user_id" uuid,
	"role" "staff_role" NOT NULL,
	"status" "staff_status" DEFAULT 'invited' NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"specializations" text[] DEFAULT '{}'::text[] NOT NULL,
	"bio" text,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"phone" text,
	"email" text,
	"address_line" text,
	"city" text,
	"state" text DEFAULT 'Kerala' NOT NULL,
	"pincode" text,
	"gstin" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"receipt_prefix" text DEFAULT 'RCPT' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"user_id" uuid,
	"member_code" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"gender" "gender",
	"date_of_birth" date,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"joined_on" date DEFAULT now() NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"assigned_trainer_id" uuid,
	"notes" text,
	"qr_token" text NOT NULL,
	"invite_token_hash" text,
	"invite_expires_at" timestamp with time zone,
	"fitness_goal" text,
	"experience_level" text,
	"training_days_per_week" integer,
	"session_minutes" integer,
	"exercise_preferences" text,
	"limitations" text,
	"limitation_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"health_screening" jsonb,
	"medical_clearance_required" boolean DEFAULT false NOT NULL,
	"medical_clearance_note" text,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_freezes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"duration_unit" "duration_unit" NOT NULL,
	"duration_value" integer NOT NULL,
	"price_paise" bigint NOT NULL,
	"admission_fee_paise" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plans_price_nonneg" CHECK ("membership_plans"."price_paise" >= 0 and "membership_plans"."admission_fee_paise" >= 0),
	CONSTRAINT "membership_plans_duration_pos" CHECK ("membership_plans"."duration_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"plan_id" uuid,
	"plan_name" text NOT NULL,
	"duration_unit" "duration_unit" NOT NULL,
	"duration_value" integer NOT NULL,
	"kind" "membership_kind" DEFAULT 'new' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"price_paise" bigint NOT NULL,
	"admission_fee_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint NOT NULL,
	"discount_note" text,
	"state" "membership_state" DEFAULT 'active' NOT NULL,
	"frozen_since" date,
	"total_frozen_days" integer DEFAULT 0 NOT NULL,
	"renewed_from_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_dates" CHECK ("memberships"."end_date" >= "memberships"."start_date"),
	CONSTRAINT "memberships_total" CHECK ("memberships"."total_paise" = "memberships"."price_paise" + "memberships"."admission_fee_paise" - "memberships"."discount_paise" and "memberships"."total_paise" >= 0 and "memberships"."discount_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"membership_id" uuid,
	"refund_of_id" uuid,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'completed' NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text,
	"notes" text,
	"receipt_number" text,
	"gateway" text,
	"gateway_payment_id" text,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_pos" CHECK ("payments"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "progress_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"recorded_on" date NOT NULL,
	"weight_kg" numeric(5, 2),
	"body_fat_pct" numeric(4, 1),
	"measurements" jsonb,
	"notes" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"active_gym_id" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"password_hash" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_contact_present" CHECK ("users"."email" is not null or "users"."phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_version" integer NOT NULL,
	"day_key" text NOT NULL,
	"performed_on" date NOT NULL,
	"entries" jsonb NOT NULL,
	"completed_exercises" integer NOT NULL,
	"total_exercises" integer NOT NULL,
	"difficulty" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_summary" text,
	"ai_generation_id" uuid,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"trainer_id" uuid,
	"name" text NOT NULL,
	"goal" text,
	"status" "workout_plan_status" DEFAULT 'draft' NOT NULL,
	"source" "workout_plan_source" NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"approved_by_staff_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_reason" text,
	"start_date" date,
	"created_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_plans_active_requires_approval" CHECK ("workout_plans"."status" <> 'active' or ("workout_plans"."approved_by_staff_id" is not null and "workout_plans"."approved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_staff_id_gym_staff_id_fk" FOREIGN KEY ("requested_by_staff_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_staff" ADD CONSTRAINT "gym_staff_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_staff" ADD CONSTRAINT "gym_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_assigned_trainer_id_gym_staff_id_fk" FOREIGN KEY ("assigned_trainer_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_freezes" ADD CONSTRAINT "membership_freezes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_created_by_staff_id_gym_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_trainer_id_gym_staff_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_approved_by_staff_id_gym_staff_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_created_by_staff_id_gym_staff_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."gym_staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_gym_created_idx" ON "ai_generations" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_member_day_key" ON "attendance" USING btree ("gym_id","member_id","check_in_date");--> statement-breakpoint
CREATE INDEX "attendance_gym_day_idx" ON "attendance" USING btree ("gym_id","check_in_date");--> statement-breakpoint
CREATE INDEX "audit_logs_gym_created_idx" ON "audit_logs" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE INDEX "exercises_gym_idx" ON "exercises" USING btree ("gym_id");--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "gym_staff_gym_user_key" ON "gym_staff" USING btree ("gym_id","user_id") WHERE "gym_staff"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_staff_invite_key" ON "gym_staff" USING btree ("invite_token_hash") WHERE "gym_staff"."invite_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "gym_staff_user_idx" ON "gym_staff" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_slug_key" ON "gyms" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "members_gym_code_key" ON "members" USING btree ("gym_id","member_code");--> statement-breakpoint
CREATE UNIQUE INDEX "members_gym_phone_key" ON "members" USING btree ("gym_id","phone") WHERE "members"."phone" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "members_gym_user_key" ON "members" USING btree ("gym_id","user_id") WHERE "members"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "members_qr_token_key" ON "members" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "members_invite_key" ON "members" USING btree ("invite_token_hash") WHERE "members"."invite_token_hash" is not null;--> statement-breakpoint
CREATE INDEX "members_gym_status_idx" ON "members" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "members_trainer_idx" ON "members" USING btree ("assigned_trainer_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_freezes_open_key" ON "membership_freezes" USING btree ("membership_id") WHERE "membership_freezes"."end_date" is null;--> statement-breakpoint
CREATE INDEX "membership_freezes_gym_idx" ON "membership_freezes" USING btree ("gym_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plans_gym_name_key" ON "membership_plans" USING btree ("gym_id",lower("name"));--> statement-breakpoint
CREATE INDEX "memberships_gym_member_idx" ON "memberships" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "memberships_gym_end_idx" ON "memberships" USING btree ("gym_id","end_date");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gym_receipt_key" ON "payments" USING btree ("gym_id","receipt_number") WHERE "payments"."receipt_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_key" ON "payments" USING btree ("gateway","gateway_payment_id") WHERE "payments"."gateway_payment_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_gym_paid_idx" ON "payments" USING btree ("gym_id","paid_at");--> statement-breakpoint
CREATE INDEX "payments_gym_member_idx" ON "payments" USING btree ("gym_id","member_id");--> statement-breakpoint
CREATE INDEX "payments_membership_idx" ON "payments" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "progress_entries_member_idx" ON "progress_entries" USING btree ("gym_id","member_id","recorded_on");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_key" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_logs_day_key" ON "workout_logs" USING btree ("member_id","plan_id","day_key","performed_on");--> statement-breakpoint
CREATE INDEX "workout_logs_gym_member_idx" ON "workout_logs" USING btree ("gym_id","member_id","performed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_plan_versions_key" ON "workout_plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_plans_one_active_key" ON "workout_plans" USING btree ("member_id") WHERE "workout_plans"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workout_plans_gym_status_idx" ON "workout_plans" USING btree ("gym_id","status");--> statement-breakpoint
CREATE INDEX "workout_plans_member_idx" ON "workout_plans" USING btree ("member_id");