CREATE TABLE "employee_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"job_title" text,
	"department" text,
	"employee_id" text
);
--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;