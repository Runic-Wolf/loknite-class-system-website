ALTER TABLE cards ADD COLUMN name_font_size INTEGER NOT NULL DEFAULT 17 CHECK (name_font_size BETWEEN 8 AND 32);
ALTER TABLE cards ADD COLUMN type_font_size INTEGER NOT NULL DEFAULT 6 CHECK (type_font_size BETWEEN 4 AND 24);
ALTER TABLE cards ADD COLUMN element_font_size INTEGER NOT NULL DEFAULT 6 CHECK (element_font_size BETWEEN 4 AND 24);
ALTER TABLE cards ADD COLUMN rule_font_size INTEGER NOT NULL DEFAULT 10 CHECK (rule_font_size BETWEEN 4 AND 32);
ALTER TABLE cards ADD COLUMN flavour_font_size INTEGER NOT NULL DEFAULT 7 CHECK (flavour_font_size BETWEEN 4 AND 32);
ALTER TABLE cards ADD COLUMN rule_text_offset_y INTEGER NOT NULL DEFAULT 0 CHECK (rule_text_offset_y BETWEEN -50 AND 50);
ALTER TABLE cards ADD COLUMN flavour_text_offset_y INTEGER NOT NULL DEFAULT 0 CHECK (flavour_text_offset_y BETWEEN -50 AND 50);

UPDATE cards SET
  name_font_size = CASE WHEN json_type(details, '$[0].nameFontSize') = 'integer' AND json_extract(details, '$[0].nameFontSize') BETWEEN 8 AND 32 THEN json_extract(details, '$[0].nameFontSize') ELSE 17 END,
  type_font_size = CASE WHEN json_type(details, '$[0].typeFontSize') = 'integer' AND json_extract(details, '$[0].typeFontSize') BETWEEN 4 AND 24 THEN json_extract(details, '$[0].typeFontSize') ELSE 6 END,
  element_font_size = CASE WHEN json_type(details, '$[0].elementFontSize') = 'integer' AND json_extract(details, '$[0].elementFontSize') BETWEEN 4 AND 24 THEN json_extract(details, '$[0].elementFontSize') ELSE 6 END,
  rule_font_size = CASE WHEN json_type(details, '$[0].ruleFontSize') = 'integer' AND json_extract(details, '$[0].ruleFontSize') BETWEEN 4 AND 32 THEN json_extract(details, '$[0].ruleFontSize') ELSE 10 END,
  flavour_font_size = CASE WHEN json_type(details, '$[0].flavourFontSize') = 'integer' AND json_extract(details, '$[0].flavourFontSize') BETWEEN 4 AND 32 THEN json_extract(details, '$[0].flavourFontSize') ELSE 7 END,
  rule_text_offset_y = CASE WHEN json_type(details, '$[0].ruleTextOffsetY') = 'integer' AND json_extract(details, '$[0].ruleTextOffsetY') BETWEEN -50 AND 50 THEN json_extract(details, '$[0].ruleTextOffsetY') ELSE 0 END,
  flavour_text_offset_y = CASE WHEN json_type(details, '$[0].flavourTextOffsetY') = 'integer' AND json_extract(details, '$[0].flavourTextOffsetY') BETWEEN -50 AND 50 THEN json_extract(details, '$[0].flavourTextOffsetY') ELSE 0 END;
