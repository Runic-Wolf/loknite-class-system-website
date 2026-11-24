import { HttpError, json, readJson } from './http.js';
import { classDetail, classOptions, keywordReferences, listRecords, overview, recordFor, settingsFor, validateId } from './catalog-read.js';
import { dashboardQuery } from './dashboard-read.js';
import { createClassNoteDraft, mutateCatalog } from './catalog-write.js';
import { listAuditEvents } from './audit.js';
import { listGalleryGroups, renameGalleryGroup } from './gallery-groups.js';
import { createCustomTag, listTagGroups } from './catalog-tags.js';
import { classTagProvenance } from './tag-provenance.js';
import { handleCatalogPresets } from './catalog-presets.js';
import { exportCatalogCsv } from './catalog-export.js';
import { changeTagsForSelection, tagAssignmentsForSelection } from './catalog-tag-batch.js';
import { resolveClassMentions } from './catalog-mentions.js';

export async function handleCatalog({ request, storage, identity, path }) {
  const [table, id, operation, ...extra] = path;
  const { method } = request;
  const sql = storage.sql;
  if (table === 'mentions' && id === 'draft' && !operation && !extra.length && method === 'POST') {
    const input = await readJson(request, 4096);
    return json(createClassNoteDraft(storage, {
      ownerId: input?.ownerId,
      tier: input?.tier,
      name: input?.name,
      owner: identity.email,
      idempotencyKey: request.headers.get('Idempotency-Key'),
    }), 201);
  }
  if (table === 'mentions' && id === 'resolve' && !operation && !extra.length && method === 'POST') {
    const input = await readJson(request, 32 * 1024);
    return json(resolveClassMentions(sql, input));
  }
  if (method === 'GET' && id === 'export.csv' && !operation && !extra.length) {
    return exportCatalogCsv(sql, table, new URL(request.url).searchParams);
  }
  if (['classes', 'cards', 'skills'].includes(table) && id === 'tags' && !extra.length) {
    if (method === 'POST' && operation === 'selection') {
      const input = await readJson(request, 96 * 1024);
      return json(tagAssignmentsForSelection(sql, table, input));
    }
    if (method === 'POST' && operation === 'bulk') {
      const input = await readJson(request, 96 * 1024);
      return json(changeTagsForSelection(storage, {
        table, input, actor: identity.email, idempotencyKey: request.headers.get('Idempotency-Key'),
      }));
    }
    throw new HttpError(405, 'Operação de tags em lote indisponível.');
  }
  if (table === 'presets') {
    if (operation || extra.length) throw new HttpError(404, 'Rota indisponível.');
    return handleCatalogPresets({ request, storage, actor: identity.email, id });
  }
  if (table === 'tags') {
    if (method === 'GET' && !id && !operation && !extra.length) return json(listTagGroups(sql));
    if (method === 'POST' && !id && !operation && !extra.length) {
      const input = await readJson(request, 4096);
      return json(createCustomTag(storage, {
        input, expected: request.headers.get('If-Match'), actor: identity.email,
      }), 201);
    }
    throw new HttpError(405, 'Operação de tags indisponível.');
  }
  if (table === 'gallery-groups') {
    if (method === 'GET' && !id && !operation && !extra.length) return json(listGalleryGroups(sql, new URL(request.url).searchParams));
    if (method === 'PATCH' && id && operation && !extra.length) {
      const input = await readJson(request, 4096);
      return json(renameGalleryGroup(storage, {
        category: id, slot: Number(operation), name: input?.name,
        expected: request.headers.get('If-Match'), actor: identity.email,
      }));
    }
    throw new HttpError(405, 'Operação de grupo indisponível.');
  }
  if (!extra.length && method === 'GET' && table === 'overview' && !id) {
    return json({ ...overview(sql), dashboard: dashboardQuery(sql, new URL(request.url).searchParams) });
  }
  if (!extra.length && method === 'GET' && table === 'audit' && !id) {
    return json(listAuditEvents(sql, identity, new URL(request.url).searchParams));
  }
  if (table === 'classes' && id === 'options' && !operation && !extra.length && method === 'GET') {
    return json(classOptions(sql, new URL(request.url).searchParams));
  }
  if (table === 'classes' && id && operation === 'tag-provenance' && !extra.length && method === 'GET') {
    return json(classTagProvenance(sql, validateId(id)));
  }
  if (extra.length || !settingsFor(table)) throw new HttpError(404, 'Rota indisponível.');
  if (method === 'GET' && !operation) {
    if (!id) return json(listRecords(sql, table, new URL(request.url).searchParams));
    const record = recordFor(sql, table, validateId(id));
    if (table === 'classes') Object.assign(record, classDetail(sql, record.item));
    if (table === 'keywords') record.references = keywordReferences(sql, record.item);
    return json(record);
  }
  let action;
  if (method === 'POST' && !id && table !== 'classes') action = 'create';
  if (method === 'PATCH' && id && !operation) action = 'update';
  if (method === 'DELETE' && id && !operation && table !== 'classes') action = 'delete';
  if (method === 'POST' && id && table === 'cards' && ['confirm', 'unconfirm'].includes(operation)) action = operation;
  if (method === 'POST' && id && table === 'cards' && operation === 'move' && !extra.length) action = 'move';
  if (method === 'POST' && id && table === 'skills' && operation === 'duplicate' && !extra.length) action = 'duplicate';
  if (!action) throw new HttpError(405, 'Operação indisponível.');
  const input = request.body ? await readJson(request, 96 * 1024) : {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'Dados inválidos.');
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (idempotencyKey && (!['create', 'duplicate', 'move'].includes(action) || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))) {
    throw new HttpError(422, 'Chave de repetição inválida ou fora de uma operação idempotente.', 'INVALID_IDEMPOTENCY_KEY');
  }
  if (['duplicate', 'move'].includes(action) && !idempotencyKey) throw new HttpError(422, 'A operação exige uma chave de repetição.');
  return json(mutateCatalog(storage, {
    table, id, input, action, expected: request.headers.get('If-Match'), owner: identity.email, idempotencyKey
  }), action === 'create' || action === 'duplicate' ? 201 : 200);
}
