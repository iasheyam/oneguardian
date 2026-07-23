ALTER TABLE plans DROP COLUMN unit_id;
ALTER TABLE plans DROP COLUMN unit_type;

CREATE TABLE plan_units (
  plan_id    UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  unit_id    UUID NOT NULL,
  unit_type  TEXT NOT NULL,  -- principal | vehicle
  PRIMARY KEY (plan_id, unit_id)
);
