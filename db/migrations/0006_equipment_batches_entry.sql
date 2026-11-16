CREATE TABLE "gym_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"catalog_key" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"group" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_equipment_quantity" CHECK ("gym_equipment"."quantity" between 1 and 999)
);
--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "entrance_token" text;--> statement-breakpoint
ALTER TABLE "gyms" ADD COLUMN "exit_token" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "batch" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_equipment" ADD CONSTRAINT "gym_equipment_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "public"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_equipment_name_key" ON "gym_equipment" USING btree ("gym_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_entrance_token_key" ON "gyms" USING btree ("entrance_token");--> statement-breakpoint
CREATE UNIQUE INDEX "gyms_exit_token_key" ON "gyms" USING btree ("exit_token");