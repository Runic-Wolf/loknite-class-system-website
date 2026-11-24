ALTER TABLE cards ADD COLUMN visual_profile TEXT
  CHECK (visual_profile IN ('framed', 'full-art-v1'));
