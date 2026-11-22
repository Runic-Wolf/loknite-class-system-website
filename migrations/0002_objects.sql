CREATE TABLE objects (
  key TEXT PRIMARY KEY,
  size INTEGER NOT NULL CHECK (size > 0)
) STRICT;

CREATE TABLE object_chunks (
  key TEXT NOT NULL REFERENCES objects(key) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  body BLOB NOT NULL,
  PRIMARY KEY (key, position)
) STRICT;
