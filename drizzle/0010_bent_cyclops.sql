CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#66727A' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "roles" ("name", "description", "color", "is_system") VALUES
  ('Admin',    'Full access to all platform menus and features', '#37C2B8', true),
  ('Operator', 'Access to Ops, Units, and Feed',                '#66727A', true);--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
  SELECT id, unnest(ARRAY['ops','units','feed','accounts','logs','admin']) FROM "roles" WHERE "name" = 'Admin';--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission")
  SELECT id, unnest(ARRAY['ops','units','feed']) FROM "roles" WHERE "name" = 'Operator';--> statement-breakpoint
UPDATE "users" SET "role_id" = r.id FROM "roles" r WHERE r.name = "users"."role";--> statement-breakpoint
UPDATE "users" SET "role_id" = r.id FROM "roles" r WHERE r.name = 'Operator' AND "users"."role_id" IS NULL;