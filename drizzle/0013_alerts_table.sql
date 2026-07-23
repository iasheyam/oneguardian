CREATE TABLE IF NOT EXISTS "alerts" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trigger_id"      uuid REFERENCES "triggers"("id") ON DELETE SET NULL,
  "unit_id"         uuid NOT NULL,
  "unit_type"       text NOT NULL,
  "severity"        text NOT NULL,
  "position"        jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status"          text DEFAULT 'active' NOT NULL,
  "acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "acknowledged_at" timestamp with time zone,
  "resolved_by"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at"     timestamp with time zone,
  "notes"           text,
  "fired_at"        timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"      timestamp with time zone DEFAULT now() NOT NULL
);
