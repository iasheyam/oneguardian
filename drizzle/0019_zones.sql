-- Add Traccar geofence sync column to places
ALTER TABLE places ADD COLUMN traccar_geofence_id INTEGER;

-- Global zones (Map Studio) — not tied to any account
CREATE TABLE zones (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  description         TEXT,
  geometry            JSONB       NOT NULL,
  risk_level          TEXT        NOT NULL DEFAULT 'low',
  enabled             BOOLEAN     NOT NULL DEFAULT true,
  traccar_geofence_id INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
