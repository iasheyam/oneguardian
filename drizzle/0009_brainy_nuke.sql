TRUNCATE "user_scope_assignments";--> statement-breakpoint
ALTER TABLE "user_scope_assignments" DROP CONSTRAINT "uq_user_scope";--> statement-breakpoint
ALTER TABLE "user_scope_assignments" ADD COLUMN "account_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user_scope_assignments" ADD CONSTRAINT "user_scope_assignments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_scope_assignments" ADD CONSTRAINT "uq_user_scope" UNIQUE("user_id","account_id","scope_type","scope_id");