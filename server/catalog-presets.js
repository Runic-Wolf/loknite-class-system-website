import { createHash } from 'node:crypto';
import { HttpError, json, readJson } from './http.js';
import { codecs, decode, encode } from './records.js';
import { normalizeClassQuery } from '../shared/class-query.js';
import { writeAudit } from './audit.js';

const presetCodec = codecs().find(codec => codec.table === 'presets');
const maxPresets = 35;

function hash(value) {
  return '"' + createHash('sha256').update(JSON.stringify(value)).digest('base64url') + '"';
}

function versionFor(row) {
  return hash({ id: row.id, position: row.position, details: row.details });
}

function fromRow(row) {
  const stored = decode(row, presetCodec);
  let query = null;
  try {
    query = normalizeClassQuery({
      logic: stored.op,
      source: stored.source,
      rules: stored.filters,
    });
  } catch {}
  return {
    item: { id: row.id, name: typeof stored.name === 'string' ? stored.name : row.id, query, position: row.position },
    version: versionFor(row),
    stored,
  };
}

function toStored(id, name, query) {
  return {
    id,
    name,
    op: query.logic,
    source: query.source,
    filters: query.rules.map((rule, index) => ({ id: `rule-${index + 1}`, ...rule })),
  };
}

function rowFor(sql, id) {
  return sql.exec('SELECT id, position, details FROM presets WHERE id = ?', id).toArray()[0] ?? null;
}

function revisionFor(sql, actor, action, id, name, fields) {
  const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
  if (!head) throw new HttpError(409, 'Importe o Vault antes de salvar uma consulta.');
  const revision = head.revision + 1;
  const createdAt = new Date().toISOString();
  const transactionId = 'tx-' + crypto.randomUUID();
  sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transactionId, createdAt, actor, `${action} presets/${id}`);
  sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transactionId, createdAt);
  writeAudit(sql, {
    revision, actor, action, resource: 'preset', resourceId: id,
    resourceName: name, changedFields: fields,
    details: {}, createdAt,
  });
  return revision;
}

function expectedVersion(request, row) {
  const expected = request.headers.get('If-Match');
  if (!expected) throw new HttpError(428, 'Recarregue a consulta antes de alterar ou excluir.');
  if (expected !== versionFor(row)) throw new HttpError(409, 'Esta consulta mudou desde que você a abriu. Atualize a lista para comparar.');
}

function validatedInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Consulta inválida.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 45) throw new HttpError(422, 'O nome precisa ter entre 1 e 45 caracteres.');
  let query;
  try { query = normalizeClassQuery(input.query); }
  catch { throw new HttpError(422, 'As regras da consulta são inválidas.'); }
  return { name, query };
}

export async function handleCatalogPresets({ request, storage, actor, id }) {
  const sql = storage.sql;
  const { method } = request;
  if (method === 'GET' && !id) {
    const rows = sql.exec('SELECT id, position, details FROM presets ORDER BY position, id').toArray();
    return json({ items: rows.map(row => ({ ...fromRow(row).item, version: versionFor(row) })) });
  }

  if (method === 'POST' && !id) {
    const input = await readJson(request, 12_000);
    const { name, query } = validatedInput(input);
    if (typeof input.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.id)) throw new HttpError(422, 'Identificador de consulta inválido.');
    const presetId = input.id;
    return storage.transactionSync(() => {
      const current = rowFor(sql, presetId);
      if (current) {
        const existing = fromRow(current).item;
        if (existing.name === name && JSON.stringify(existing.query) === JSON.stringify(query)) {
          const { item, version } = fromRow(current);
          return json({ item, version, revision: sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision, unchanged: true });
        }
        throw new HttpError(409, 'O identificador desta consulta já está em uso.');
      }
      if (sql.exec('SELECT count(*) AS total FROM presets').one().total >= maxPresets) throw new HttpError(409, 'O Vault aceita até 35 consultas salvas. Exclua uma antes de criar outra.');
      const position = sql.exec('SELECT coalesce(max(position) + 1, 0) AS next FROM presets').one().next;
      const stored = toStored(presetId, name, query);
      const row = encode(stored, position, presetCodec);
      sql.exec('INSERT INTO presets (id, position, details) VALUES (?, ?, ?)', row.id, row.position, row.details);
      const revision = revisionFor(sql, actor, 'create', presetId, name, ['name', 'query']);
      const saved = rowFor(sql, presetId);
      const { item, version } = fromRow(saved);
      return json({ item, version, revision }, 201);
    });
  }

  if ((method === 'PATCH' || method === 'DELETE') && id) {
    const presetId = id;
    const input = method === 'PATCH' ? validatedInput(await readJson(request, 12_000)) : undefined;
    return storage.transactionSync(() => {
      const before = rowFor(sql, presetId);
      if (!before) throw new HttpError(404, 'A consulta não existe.');
      expectedVersion(request, before);
      const current = fromRow(before);
      if (method === 'DELETE') {
        sql.exec('DELETE FROM presets WHERE id = ?', presetId);
        const revision = revisionFor(sql, actor, 'delete', presetId, current.item.name, ['record']);
        return json({ id: presetId, revision });
      }

      const { name, query } = input;
      if (current.item.name === name && JSON.stringify(current.item.query) === JSON.stringify(query)) {
        return json({ item: current.item, version: current.version, revision: sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision, unchanged: true });
      }
      const stored = toStored(presetId, name, query);
      const row = encode(stored, before.position, presetCodec);
      sql.exec('UPDATE presets SET details = ? WHERE id = ?', row.details, presetId);
      const revision = revisionFor(sql, actor, 'update', presetId, name, ['name', 'query']);
      const { item, version } = fromRow(rowFor(sql, presetId));
      return json({ item, version, revision });
    });
  }

  throw new HttpError(405, 'Operação de consultas salvas indisponível.');
}
