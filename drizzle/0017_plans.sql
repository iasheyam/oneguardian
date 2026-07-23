CREATE TABLE plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  unit_id     UUID        NOT NULL,
  unit_type   TEXT        NOT NULL,                -- principal | vehicle
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'recurring', -- recurring | one_time
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_legs (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               UUID        NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  leg_order             INTEGER     NOT NULL DEFAULT 0,
  origin_place_id       UUID        REFERENCES places(id) ON DELETE SET NULL,
  destination_place_id  UUID        REFERENCES places(id) ON DELETE SET NULL,
  days_of_week          JSONB,                     -- [0..6], 0=Sun; null for one_time
  window_start          TEXT,                      -- 'HH:MM'; null for one_time
  window_end            TEXT,                      -- 'HH:MM'; null for one_time
  arrival_at            TIMESTAMPTZ,               -- null for recurring
  departure_at          TIMESTAMPTZ,               -- null for recurring
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
