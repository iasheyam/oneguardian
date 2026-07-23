ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "is_simulation" boolean NOT NULL DEFAULT false;
