CREATE TABLE workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vault_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  transaction_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('C1', 'C2', 'C3', 'SPEC')),
  parent_id TEXT REFERENCES classes(id) DEFERRABLE INITIALLY DEFERRED,
  slot TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  concept TEXT,
  notes TEXT,
  image_path TEXT,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;
CREATE INDEX classes_parent_idx ON classes(parent_id);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) DEFERRABLE INITIALLY DEFERRED,
  card_id TEXT NOT NULL UNIQUE REFERENCES cards(id) DEFERRABLE INITIALLY DEFERRED,
  name TEXT NOT NULL,
  kind TEXT,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;
CREATE INDEX skills_class_idx ON skills(class_id);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  skill_id TEXT UNIQUE REFERENCES skills(id) DEFERRABLE INITIALLY DEFERRED,
  owner_id TEXT REFERENCES classes(id) DEFERRABLE INITIALLY DEFERRED,
  category TEXT NOT NULL CHECK (category IN ('class', 'enemy', 'neutral', 'equipment', 'species', 'status')),
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  element TEXT NOT NULL,
  cost TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  flavour_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RASCUNHO', 'CONFIRMADO')),
  workflow_status TEXT,
  art_path TEXT,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;
CREATE INDEX cards_category_idx ON cards(category, slot);
CREATE INDEX cards_owner_idx ON cards(owner_id);

CREATE TABLE keywords (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  effect TEXT NOT NULL,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;

CREATE TABLE class_tags (
  entity_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (entity_id, tag)
) STRICT;
CREATE TABLE skill_tags (
  entity_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (entity_id, tag)
) STRICT;
CREATE TABLE card_tags (
  entity_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (entity_id, tag)
) STRICT;

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;
CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  details TEXT NOT NULL CHECK (json_valid(details))
) STRICT;
CREATE TABLE settings (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value)),
  PRIMARY KEY (scope, key)
) STRICT;

CREATE TABLE vault_revisions (
  revision INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL
) STRICT;
CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL
) STRICT;
CREATE TABLE media_objects (
  path TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0)
) STRICT;
