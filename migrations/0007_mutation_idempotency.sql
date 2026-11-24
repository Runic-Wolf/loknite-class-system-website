CREATE TABLE mutation_idempotency (
  actor TEXT NOT NULL,
  resource TEXT NOT NULL CHECK (resource IN ('cards', 'skills', 'keywords')),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor, resource, key)
) STRICT;

CREATE INDEX mutation_idempotency_created_idx ON mutation_idempotency(created_at);
