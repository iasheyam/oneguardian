ALTER TABLE "principals" ADD COLUMN "primary_device_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "primary_device_id" uuid;--> statement-breakpoint
ALTER TABLE "principals" ADD CONSTRAINT "principals_primary_device_id_fk" FOREIGN KEY ("primary_device_id") REFERENCES "devices"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_primary_device_id_fk" FOREIGN KEY ("primary_device_id") REFERENCES "devices"("id") ON DELETE SET NULL;