import { createHash } from 'node:crypto';
import { HttpError } from './http.js';
import { validateId } from './catalog-read.js';
import { listTagGroups } from './catalog-tags.js';
import { writeAudit } from './audit.js';

const resources = {
  classes: { tags: 'class_tags' },
  cards: { tags: 'card_tags' },
  skills: { tags: 'skill_tags' },
};
const maximumSelection = 500;

function resourceFor(table) {
  const resource = resources[table];
  if (!resource) throw new HttpError(422, 'Tags em lote só estão disponíveis para classes, cartas e skills.');
  return resource;
}

function selectedIds(values) {
  if (!values.length || values.length > maximumSelection || values.some(value => typeof value !== 'string')) {
    throw new HttpError(422, `Selecione entre 1 e ${maximumSelection} registros.`);
  }
  const ids = values.map(validateId);
  if (new Set(ids).size !== ids.length) throw new HttpError(422, 'A seleção contém registros duplicados.');
  return ids;
}

function assertRecordsExist(sql, table, ids) {
  const rows = sql.exec(`SELECT id FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids).toArray();
  if (rows.length !== ids.length) throw new HttpError(409, 'Um ou mais registros da seleção mudaram. Atualize a lista e revise a seleção.', 'SELECTION_CHANGED');
}

function assignmentsFor(sql, table, ids) {
  const resource = resourceFor(table);
  assertRecordsExist(sql, table, ids);
  const assignments = Object.fromEntries(ids.map(id => [id, []]));
  const rows = sql.exec(`SELECT entity_id AS id, tag FROM ${resource.tags}
    WHERE entity_id IN (${ids.map(() => '?').join(', ')}) ORDER BY entity_id, position, tag`, ...ids).toArray();
  for (const row of rows) assignments[row.id].push(row.tag);
  return { selectedCount: ids.length, assignments };
}

export function tagAssignmentsForSelection(sql, table, input) {
  resourceFor(table);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => key !== 'ids')) {
    throw new HttpError(422, 'Consulta de seleção inválida.');
  }
  return assignmentsFor(sql, table, selectedIds(input.ids ?? []));
}

function validatedInput(sql, table, input) {
  resourceFor(table);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['ids', 'action', 'tag'].includes(key))) {
    throw new HttpError(422, 'Dados de atribuição em lote inválidos.');
  }
  const ids = selectedIds(input.ids ?? []);
  if (!['add', 'remove'].includes(input.action)) throw new HttpError(422, 'Escolha adicionar ou remover a tag.');
  if (typeof input.tag !== 'string' || input.tag.trim().length < 1 || input.tag.trim().length > 80) {
    throw new HttpError(422, 'Escolha uma tag válida.');
  }
  const tag = input.tag.trim();
  const groups = listTagGroups(sql).groups.filter(group => !group.structural && !(table !== 'classes' && group.id === 'elements'));
  if (!groups.some(group => group.tags.some(choice => choice.value === tag))) {
    throw new HttpError(422, table === 'classes'
      ? 'A tag não pertence ao vocabulário atual ou é estrutural.'
      : 'A tag não pertence ao vocabulário atual. Elementos de cartas e skills são editados no campo Element.');
  }
  return { ids, action: input.action, tag };
}

export function changeTagsForSelection(storage, { table, input, actor, idempotencyKey }) {
  const { sql } = storage;
  return storage.transactionSync(() => {
    const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
    if (!head) throw new HttpError(409, 'Importe o Vault antes de editar.');
    const { ids, action, tag } = validatedInput(sql, table, input);
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new HttpError(422, 'A operação exige uma chave de repetição válida.', 'INVALID_IDEMPOTENCY_KEY');
    }

    const canonical = { table, ids: [...ids].sort(), action, tag };
    const requestHash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    const existing = sql.exec(`SELECT request_hash, response_json FROM mutation_idempotency
      WHERE actor = ? AND resource = ? AND key = ?`, actor, table, idempotencyKey).toArray()[0];
    if (existing) {
      if (existing.request_hash !== requestHash) throw new HttpError(409, 'Esta chave de repetição já foi usada com outros dados.', 'IDEMPOTENCY_KEY_REUSED');
      return JSON.parse(existing.response_json);
    }
    const expiredBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    sql.exec('DELETE FROM mutation_idempotency WHERE created_at < ?', expiredBefore);

    const resource = resourceFor(table);
    const records = sql.exec(`SELECT id, name FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids).toArray();
    if (records.length !== ids.length) throw new HttpError(409, 'Um ou mais registros da seleção mudaram. Atualize a lista e revise a seleção.', 'SELECTION_CHANGED');
    const presentRows = sql.exec(`SELECT entity_id AS id FROM ${resource.tags} WHERE tag = ?
      AND entity_id IN (${ids.map(() => '?').join(', ')})`, tag, ...ids).toArray();
    const present = new Set(presentRows.map(row => row.id));
    const changedIds = action === 'add' ? ids.filter(id => !present.has(id)) : ids.filter(id => present.has(id));
    let revision = head.revision;
    let transaction = null;
    let now = new Date().toISOString();

    if (changedIds.length) {
      if (action === 'add') {
        const values = changedIds.map(() => '(?)').join(', ');
        sql.exec(`WITH selected(id) AS (VALUES ${values})
          INSERT OR IGNORE INTO ${resource.tags} (entity_id, tag, position)
          SELECT selected.id, ?, COALESCE((SELECT MAX(current.position) + 1 FROM ${resource.tags} current WHERE current.entity_id = selected.id), 0)
          FROM selected`, ...changedIds, tag);
      } else {
        sql.exec(`DELETE FROM ${resource.tags} WHERE tag = ? AND entity_id IN (${changedIds.map(() => '?').join(', ')})`, tag, ...changedIds);
      }

      revision += 1;
      transaction = 'tx-' + crypto.randomUUID();
      const recordNames = new Map(records.map(record => [record.id, record.name]));
      const targetLabel = table === 'classes' ? 'class' : table === 'cards' ? 'card' : 'skill';
      const targetLabelPlural = table === 'classes' ? 'classes' : table === 'cards' ? 'cards' : 'skills';
      const targetLabelForAudit = changedIds.length === 1 ? targetLabel : targetLabelPlural;
      sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, now, actor, `bulk tag ${action} ${table}/${tag}`);
      writeAudit(sql, {
        revision, actor, action: 'update', resource: 'tags', resourceId: `${table}:${tag}`,
        resourceName: `${tag} · ${changedIds.length} ${targetLabelForAudit}`,
        changedFields: ['tags'],
        details: {
          operation: action, table, tag, selectedCount: ids.length, changedCount: changedIds.length,
          records: changedIds.map(id => ({ id, name: recordNames.get(id) ?? '' })),
        },
        createdAt: now,
      });
      sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, now);
    }

    const result = {
      table, action, tag, selectedCount: ids.length, changedCount: changedIds.length,
      unchangedCount: ids.length - changedIds.length, revision,
      ...(changedIds.length ? {} : { unchanged: true }),
    };
    sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`, actor, table, idempotencyKey, requestHash, JSON.stringify(result), now);
    return result;
  });
}
