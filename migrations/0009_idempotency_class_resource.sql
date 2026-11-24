CREATE TABLE mutation_idempotency_next (
  actor TEXT NOT NULL,
  resource TEXT NOT NULL CHECK (resource IN ('classes', 'cards', 'skills', 'keywords')),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 16 AND 128),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor, resource, key)
) STRICT;

INSERT INTO mutation_idempotency_next (actor, resource, key, request_hash, response_json, created_at)
SELECT actor, resource, key, request_hash, response_json, created_at FROM mutation_idempotency;

DROP TABLE mutation_idempotency;
ALTER TABLE mutation_idempotency_next RENAME TO mutation_idempotency;
CREATE INDEX mutation_idempotency_created_idx ON mutation_idempotency(created_at);
