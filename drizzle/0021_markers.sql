CREATE TABLE markers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  category    TEXT        NOT NULL DEFAULT 'Other',
  risk_level  TEXT        NOT NULL DEFAULT 'low',
  latitude    REAL        NOT NULL,
  longitude   REAL        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
