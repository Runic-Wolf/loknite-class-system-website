CREATE TABLE audit_events (
  event_id TEXT PRIMARY KEY,
  revision INTEGER REFERENCES vault_revisions(revision),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  resource_name TEXT,
  changed_fields TEXT NOT NULL CHECK (json_valid(changed_fields)),
  details TEXT NOT NULL CHECK (json_valid(details)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX audit_created_idx ON audit_events(created_at DESC, event_id DESC);
CREATE INDEX audit_actor_created_idx ON audit_events(actor, created_at DESC, event_id DESC);
CREATE INDEX audit_revision_idx ON audit_events(revision DESC);

INSERT INTO audit_events (
  event_id, revision, actor, action, resource, resource_id, resource_name,
  changed_fields, details, created_at
)
SELECT 'legacy-revision-' || revision, revision, actor, action, NULL, NULL, NULL,
  '[]', json_object('legacy', true), updated_at
FROM vault_revisions;
