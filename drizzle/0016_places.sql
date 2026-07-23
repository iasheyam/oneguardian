CREATE TABLE places (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  address     TEXT,
  mapbox_id   TEXT,
  latitude    FLOAT8      NOT NULL,
  longitude   FLOAT8      NOT NULL,
  radius      INTEGER     NOT NULL DEFAULT 150,
  color       TEXT        NOT NULL DEFAULT '#2563eb',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
