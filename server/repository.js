import { codecs, fromRows, toRows } from './records.js';
import { VaultError } from './vault-domain.js';
import { changedFields } from './audit.js';

const tables = codecs();
const guard = 'COALESCE((SELECT revision FROM workspace WHERE id = 1), 0) = ?2';

function chunks(items) {
  const result = [];
  let entries = [];
  let size = 0;
  for (const item of items) {
    const encoded = JSON.stringify(item);
    if (size + encoded.length > 120_000 && entries.length) {
      result.push('[' + entries.join(',') + ']');
      entries = [];
      size = 0;
    }
    entries.push(encoded);
    size += encoded.length + 1;
  }
  if (entries.length) result.push('[' + entries.join(',') + ']');
  return result;
}

function keyFor(codec, row) {
  return JSON.stringify(codec.key.map(field => row[field]));
}

function changes(codec, before, after) {
  const previous = new Map(before.map(row => [keyFor(codec, row), JSON.stringify(row)]));
  const upserts = [];
  for (const row of after) {
    const key = keyFor(codec, row);
    if (previous.get(key) !== JSON.stringify(row)) upserts.push(row);
    previous.delete(key);
  }
  const deletes = [...previous.keys()].map(key => Object.fromEntries(JSON.parse(key).map((value, index) => [codec.key[index], value])));
  return { deletes, upserts };
}

function deleteSQL({ table, key }) {
  const matches = key.map(field => `${table}.${field} = json_extract(batch.value, '$.${field}')`).join(' AND ');
  return `DELETE FROM ${table} WHERE ${guard}
    AND EXISTS (SELECT 1 FROM json_each(?1) batch WHERE ${matches})`;
}

function upsertSQL({ table, key, fields }) {
  const columns = fields.join(', ');
  const values = fields.map(field => `json_extract(value, '$.${field}')`).join(', ');
  const updates = fields.filter(field => !key.includes(field)).map(field => `${field} = excluded.${field}`).join(', ');
  return `INSERT INTO ${table} (${columns})
    SELECT ${values} FROM json_each(?1) WHERE ${guard}
    ON CONFLICT (${key.join(', ')}) DO UPDATE SET ${updates}`;
}

function auditSummary(previous, next, plans) {
  const collections = {};
  const targets = [];
  const resources = new Map([
    ['classes', ['class', previous?.vault.classes ?? [], next.vault.classes ?? []]],
    ['skills', ['skill', previous?.vault.skills ?? [], next.vault.skills ?? []]],
    ['cards', ['card', previous?.cardvault.cards ?? [], next.cardvault.cards ?? []]],
    ['keywords', ['keyword', previous?.cardvault.keywords ?? [], next.cardvault.keywords ?? []]],
    ['links', ['link', previous?.vault.links ?? [], next.vault.links ?? []]],
    ['presets', ['preset', previous?.vault.presets ?? [], next.vault.presets ?? []]]
  ]);
  for (const [table, [resource, beforeRows, afterRows]] of resources) {
    const plan = plans.find(item => item.codec.table === table);
    const oldById = new Map(beforeRows.map(record => [record.id, record]));
    const newById = new Map(afterRows.map(record => [record.id, record]));
    const counts = { created: 0, updated: 0, deleted: plan?.deletes.length ?? 0 };
    for (const row of plan?.upserts ?? []) {
      const before = oldById.get(row.id);
      const after = newById.get(row.id);
      const operation = before ? 'updated' : 'created';
      counts[operation]++;
      if (targets.length < 40) targets.push({ resource, id: row.id, name: after?.name ?? row.id, operation,
        fields: before ? changedFields(before, after) : changedFields({}, after) });
    }
    for (const row of plan?.deletes ?? []) {
      if (targets.length < 40) targets.push({ resource, id: row.id, name: oldById.get(row.id)?.name ?? row.id,
        operation: 'deleted', fields: ['record'] });
    }
    if (counts.created || counts.updated || counts.deleted) collections[resource] = counts;
  }
  const changedCount = Object.values(collections).reduce((sum, counts) => sum + counts.created + counts.updated + counts.deleted, 0);
  const settingChanges = (plans.find(item => item.codec.table === 'settings')?.upserts ?? [])
    .map(row => `${row.scope}/${row.key}`).slice(0, 40);
  return { collections, targets, truncated: Math.max(0, changedCount - targets.length), settingChanges };
}

export function createRepository({ DB: db, OBJECTS: objects }, actor, action, expectedRevision) {
  return {
    async read() {
      const [head, ...results] = await db.batch([
        db.prepare('SELECT * FROM workspace WHERE id = 1'),
        ...tables.map(codec => db.prepare(`SELECT * FROM ${codec.table}${codec.order ? ' ORDER BY ' + codec.order : ''}`))
      ]);
      const state = head.results[0];
      if (expectedRevision !== undefined && (state?.revision ?? 0) !== expectedRevision) {
        throw new VaultError('REVISION_CONFLICT', 'Outra pessoa salvou uma revisão mais recente. Recarregue antes de editar.');
      }
      if (!state) return null;
      return fromRows(state, new Map(tables.map((codec, index) => [codec.table, results[index].results])));
    },

    async commit(previous, pair) {
      const old = toRows(previous);
      const next = toRows(pair);
      const expected = previous?.vault.revision ?? 0;
      const { revision, transactionId, updatedAt, vaultId } = pair.vault;
      const plans = tables.map(codec => ({
        codec, ...changes(codec, old.get(codec.table) ?? [], next.get(codec.table) ?? [])
      }));
      const summary = auditSummary(previous, pair, plans);
      const statements = [];
      for (const { codec, deletes } of [...plans].reverse()) {
        for (const part of chunks(deletes)) statements.push(db.prepare(deleteSQL(codec)).bind(part, expected));
      }
      for (const { codec, upserts } of plans) {
        for (const part of chunks(upserts)) statements.push(db.prepare(upsertSQL(codec)).bind(part, expected));
      }
      statements.push(db.prepare(`INSERT INTO vault_revisions (revision, transaction_id, updated_at, actor, action)
        SELECT ?1, ?3, ?4, ?5, ?6 WHERE ${guard}`).bind(revision, expected, transactionId, updatedAt, actor, action));
      statements.push(db.prepare(`INSERT INTO audit_events (
        event_id, revision, actor, action, resource, resource_id, resource_name,
        changed_fields, details, created_at
      ) SELECT ?1, ?2, ?3, ?4, 'workspace', NULL, 'Workspace', '[]', ?5, ?6
        WHERE COALESCE((SELECT revision FROM workspace WHERE id = 1), 0) = ?7`)
        .bind('audit-' + crypto.randomUUID(), revision, actor, action, JSON.stringify(summary), updatedAt, expected));
      statements.push(db.prepare(`INSERT INTO workspace (id, vault_id, revision, transaction_id, updated_at)
        SELECT 1, ?1, ?3, ?4, ?5 WHERE ${guard}
        ON CONFLICT(id) DO UPDATE SET revision = excluded.revision,
          transaction_id = excluded.transaction_id, updated_at = excluded.updated_at`)
        .bind(vaultId, expected, revision, transactionId, updatedAt));
      const results = await db.batch(statements);
      if (!results.at(-1).meta.changes) {
        throw new VaultError('REVISION_CONFLICT', 'Outra pessoa salvou uma revisão mais recente. Recarregue antes de editar.');
      }
    },

    async backups() {
      const { results } = await db.prepare(`SELECT id, revision, created_at AS createdAt, 1 AS valid
        FROM backups ORDER BY created_at DESC LIMIT 50`).all();
      return results;
    },

    async createBackup(pair) {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await objects.put('backups/' + id, JSON.stringify(pair));
      await db.batch([
        db.prepare('INSERT INTO backups (id, revision, created_at, actor) VALUES (?, ?, ?, ?)')
          .bind(id, pair.vault.revision, createdAt, actor),
        db.prepare(`INSERT INTO audit_events (
          event_id, revision, actor, action, resource, resource_id, resource_name,
          changed_fields, details, created_at
        ) VALUES (?, ?, ?, 'create', 'backup', ?, 'Workspace backup', '["revision"]', ?, ?)`)
          .bind('audit-' + crypto.randomUUID(), pair.vault.revision, actor, id,
            JSON.stringify({ sourceRevision: pair.vault.revision }), createdAt)
      ]);
      return { id, revision: pair.vault.revision, createdAt };
    },

    async readBackup(id) {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) return null;
      if (!await db.prepare('SELECT id FROM backups WHERE id = ?').bind(id).first()) return null;
      const object = await objects.get('backups/' + id);
      return object ? object.json() : null;
    }
  };
}
