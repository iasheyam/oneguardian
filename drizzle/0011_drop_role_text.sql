ALTER TABLE "invitations" ADD COLUMN "role_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "invitations" SET "role_id" = r.id FROM "roles" r WHERE r.name = "invitations"."role";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";
