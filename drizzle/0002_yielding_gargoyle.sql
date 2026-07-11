ALTER TABLE "invitations" ADD COLUMN "type" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "type" text DEFAULT 'internal' NOT NULL;