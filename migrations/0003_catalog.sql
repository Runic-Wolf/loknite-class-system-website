CREATE INDEX classes_name_idx ON classes(name COLLATE NOCASE, id);
CREATE INDEX classes_tier_name_idx ON classes(tier, name COLLATE NOCASE, id);
CREATE INDEX cards_name_idx ON cards(name COLLATE NOCASE, id);
CREATE INDEX cards_category_name_idx ON cards(category, name COLLATE NOCASE, id);
CREATE INDEX cards_status_name_idx ON cards(status, name COLLATE NOCASE, id);
CREATE INDEX cards_owner_name_idx ON cards(owner_id, name COLLATE NOCASE, id);
CREATE INDEX keywords_name_idx ON keywords(name COLLATE NOCASE, id);
CREATE INDEX skills_name_idx ON skills(name COLLATE NOCASE, id);
CREATE INDEX skills_class_name_idx ON skills(class_id, name COLLATE NOCASE, id);
CREATE INDEX links_from_idx ON links(json_extract(details, '$[0].from'));
CREATE INDEX links_to_idx ON links(json_extract(details, '$[0].to'));

CREATE VIRTUAL TABLE classes_search USING fts5(name, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
INSERT INTO classes_search(rowid, name, body)
  SELECT rowid, name, coalesce(concept, '') || ' ' || coalesce(notes, '') FROM classes;
CREATE TRIGGER classes_search_insert AFTER INSERT ON classes BEGIN
  INSERT INTO classes_search(rowid, name, body) VALUES (new.rowid, new.name, coalesce(new.concept, '') || ' ' || coalesce(new.notes, ''));
END;
CREATE TRIGGER classes_search_update AFTER UPDATE OF name, concept, notes ON classes
WHEN old.name IS NOT new.name OR old.concept IS NOT new.concept OR old.notes IS NOT new.notes BEGIN
  DELETE FROM classes_search WHERE rowid = old.rowid;
  INSERT INTO classes_search(rowid, name, body) VALUES (new.rowid, new.name, coalesce(new.concept, '') || ' ' || coalesce(new.notes, ''));
END;
CREATE TRIGGER classes_search_delete AFTER DELETE ON classes BEGIN
  DELETE FROM classes_search WHERE rowid = old.rowid;
END;

CREATE VIRTUAL TABLE cards_search USING fts5(name, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
INSERT INTO cards_search(rowid, name, body)
  SELECT rowid, name, rule_text || ' ' || flavour_text FROM cards;
CREATE TRIGGER cards_search_insert AFTER INSERT ON cards BEGIN
  INSERT INTO cards_search(rowid, name, body) VALUES (new.rowid, new.name, new.rule_text || ' ' || new.flavour_text);
END;
CREATE TRIGGER cards_search_update AFTER UPDATE OF name, rule_text, flavour_text ON cards
WHEN old.name IS NOT new.name OR old.rule_text IS NOT new.rule_text OR old.flavour_text IS NOT new.flavour_text BEGIN
  DELETE FROM cards_search WHERE rowid = old.rowid;
  INSERT INTO cards_search(rowid, name, body) VALUES (new.rowid, new.name, new.rule_text || ' ' || new.flavour_text);
END;
CREATE TRIGGER cards_search_delete AFTER DELETE ON cards BEGIN
  DELETE FROM cards_search WHERE rowid = old.rowid;
END;

CREATE VIRTUAL TABLE skills_search USING fts5(name, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
INSERT INTO skills_search(rowid, name, body)
  SELECT rowid, name, coalesce(json_extract(details, '$[0].lcsNotes'), '') FROM skills;
CREATE TRIGGER skills_search_insert AFTER INSERT ON skills BEGIN
  INSERT INTO skills_search(rowid, name, body) VALUES (new.rowid, new.name, coalesce(json_extract(new.details, '$[0].lcsNotes'), ''));
END;
CREATE TRIGGER skills_search_update AFTER UPDATE OF name, details ON skills
WHEN old.name IS NOT new.name OR old.details IS NOT new.details BEGIN
  DELETE FROM skills_search WHERE rowid = old.rowid;
  INSERT INTO skills_search(rowid, name, body) VALUES (new.rowid, new.name, coalesce(json_extract(new.details, '$[0].lcsNotes'), ''));
END;
CREATE TRIGGER skills_search_delete AFTER DELETE ON skills BEGIN
  DELETE FROM skills_search WHERE rowid = old.rowid;
END;

CREATE VIRTUAL TABLE keywords_search USING fts5(name, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
INSERT INTO keywords_search(rowid, name, body)
  SELECT rowid, name, effect FROM keywords;
CREATE TRIGGER keywords_search_insert AFTER INSERT ON keywords BEGIN
  INSERT INTO keywords_search(rowid, name, body) VALUES (new.rowid, new.name, new.effect);
END;
CREATE TRIGGER keywords_search_update AFTER UPDATE OF name, effect ON keywords
WHEN old.name IS NOT new.name OR old.effect IS NOT new.effect BEGIN
  DELETE FROM keywords_search WHERE rowid = old.rowid;
  INSERT INTO keywords_search(rowid, name, body) VALUES (new.rowid, new.name, new.effect);
END;
CREATE TRIGGER keywords_search_delete AFTER DELETE ON keywords BEGIN
  DELETE FROM keywords_search WHERE rowid = old.rowid;
END;
