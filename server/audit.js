import { HttpError } from './http.js';

const excludedFields = new Set([
  'updatedAt', 'createdAt', 'confirmedAt', 'confirmedRevision', 'confirmedGameplayHash',
  'sourceSnapshot', 'sourceRevisionAtSync', 'legacyName', 'divergence'
]);

export function changedFields(before, after) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter(key => !excludedFields.has(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])).sort();
}

export function writeAudit(sql, event) {
  sql.exec(`INSERT INTO audit_events (
    event_id, revision, actor, action, resource, resource_id, resource_name,
    changed_fields, details, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  event.id ?? 'audit-' + crypto.randomUUID(), event.revision ?? null, event.actor, event.action,
  event.resource ?? null, event.resourceId ?? null, event.resourceName ?? null,
  JSON.stringify(event.changedFields ?? []), JSON.stringify(event.details ?? {}),
  event.createdAt ?? new Date().toISOString());
}

function encodeCursor(createdAt, id) {
  return Buffer.from(JSON.stringify([createdAt, id])).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  let cursor;
  try { cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch {}
  if (!Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || typeof cursor[1] !== 'string' || cursor.some(part => part.length > 180)) {
    throw new HttpError(422, 'Cursor de histórico inválido.');
  }
  return cursor;
}

export function listAuditEvents(sql, identity, params) {
  const limit = Number(params.get('limit') ?? '20');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(422, 'O limite do histórico deve estar entre 1 e 50.');
  const cursor = decodeCursor(params.get('after'));
  const requestedActor = (params.get('actor') ?? '').trim().toLowerCase();
  if (requestedActor && (!identity.admin || requestedActor.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedActor))) {
    throw new HttpError(422, 'Filtro de pessoa inválido.');
  }
  const clauses = [];
  const bindings = [];
  if (!identity.admin) {
    clauses.push('actor = ?');
    bindings.push(identity.email);
  } else if (requestedActor) {
    clauses.push('actor = ?');
    bindings.push(requestedActor);
  }
  if (cursor) {
    clauses.push('(created_at, event_id) < (?, ?)');
    bindings.push(cursor[0], cursor[1]);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = sql.exec(`SELECT event_id AS id, revision, actor, action, resource, resource_id AS resourceId,
    resource_name AS resourceName, changed_fields AS changedFields, details, created_at AS createdAt
    FROM audit_events${where} ORDER BY created_at DESC, event_id DESC LIMIT ?`, ...bindings, limit + 1).toArray();
  const items = rows.slice(0, limit).map(row => ({
    ...row,
    changedFields: JSON.parse(row.changedFields),
    details: JSON.parse(row.details)
  }));
  const last = items.at(-1);
  return {
    items,
    next: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    actors: identity.admin ? sql.exec('SELECT DISTINCT actor FROM audit_events ORDER BY actor COLLATE NOCASE').toArray().map(row => row.actor) : [identity.email]
  };
}
