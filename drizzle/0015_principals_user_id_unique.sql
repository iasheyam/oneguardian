ALTER TABLE principals
  ADD CONSTRAINT principals_user_id_unique UNIQUE (user_id);
