-- System triggers for zone geofence events (entry + exit per risk level)
INSERT INTO triggers (name, trigger_type, severity, conditions, unit_type, source, is_universal, is_system, enabled, cooldown_seconds)
VALUES
  ('Critical Zone Entry', 'zone_entry', 'red_alert', '{"riskLevel":"critical"}', 'both', 'server', true, true, true, 300),
  ('Critical Zone Exit',  'zone_exit',  'red_alert', '{"riskLevel":"critical"}', 'both', 'server', true, true, true, 300),
  ('High Risk Zone Entry','zone_entry', 'red_alert', '{"riskLevel":"high"}',     'both', 'server', true, true, true, 300),
  ('High Risk Zone Exit', 'zone_exit',  'red_alert', '{"riskLevel":"high"}',     'both', 'server', true, true, true, 300),
  ('Medium Zone Entry',   'zone_entry', 'warning',   '{"riskLevel":"medium"}',   'both', 'server', true, true, true, 300),
  ('Medium Zone Exit',    'zone_exit',  'warning',   '{"riskLevel":"medium"}',   'both', 'server', true, true, true, 300),
  ('Low Zone Entry',      'zone_entry', 'advisory',  '{"riskLevel":"low"}',      'both', 'server', true, true, true, 300),
  ('Low Zone Exit',       'zone_exit',  'advisory',  '{"riskLevel":"low"}',      'both', 'server', true, true, true, 300)
ON CONFLICT DO NOTHING;
