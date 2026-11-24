import { sceneLayerPaths, validSceneSettings } from '../shared/card-scene.js';
import { HttpError } from './http.js';
import { createHash } from 'node:crypto';
import { codecs } from './records.js';
import { encode } from './records.js';
import { ancestry, categories, recordFor, skillKinds, validateId } from './catalog-read.js';
import { changedFields, writeAudit } from './audit.js';
import { gameplayHash, mediaPath, validateCardBody, validateTagList, customTagSet, syncElementTag, sourceDiff, normalizeKeywordName, keywordNameKey } from './vault-domain.js';
import { defaultElementForClassLineage } from './class-default-element.js';
import { resolveClassMentions } from './catalog-mentions.js';
import catalog from './catalog.generated.json';

const tables = new Map(codecs().map(codec => [codec.table, codec]));
const classFields = { name: 160, concept: 4000, notes: 32000 };
const cardFields = { name: 160, type: 32, element: 32, cost: 2, ruleText: 12000, flavourText: 12000, workflowStatus: 32 };
const cardVisualBounds = {
  nameFontSize: [8, 32], typeFontSize: [4, 24], elementFontSize: [4, 24],
  ruleFontSize: [4, 32], flavourFontSize: [4, 32], ruleTextOffsetY: [-50, 50], flavourTextOffsetY: [-50, 50],
  artZoomPercent: [50, 200], artOffsetXPercent: [-50, 50], artOffsetYPercent: [-50, 50]
};

function visualFields(input) {
  const result = {};
  if (Object.hasOwn(input, 'visualProfile')) {
    const profile = input.visualProfile;
    if (profile !== 'framed' && profile !== 'full-art-v1') throw new HttpError(422, 'Composição de carta inválida.');
    result.visualProfile = profile;
  }
  for (const [field, [min, max]] of Object.entries(cardVisualBounds)) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(422, `Valor visual inválido no campo ${field}.`);
    result[field] = value;
  }
  return result;
}

function textFields(input, fields) {
  const result = {};
  for (const [key, limit] of Object.entries(fields)) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== 'string' || input[key].length > limit) throw new HttpError(422, 'Valor inválido no campo ' + key + '.');
    result[key] = key === 'name' ? input[key].trim() : input[key];
  }
  if (result.name === '') throw new HttpError(422, 'Preencha o nome.');
  return result;
}

function tagsFor(sql, input, current = []) {
  if (!Object.hasOwn(input, 'tags')) return current;
  if (!Array.isArray(input.tags) || input.tags.length > 40 || input.tags.some(tag => typeof tag !== 'string' || tag.length > 80)) {
    throw new HttpError(422, 'Lista de tags inválida.');
  }
  const tags = [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))];
  const groups = Object.fromEntries(sql.exec("SELECT key, value FROM settings WHERE scope = 'customGroups'").toArray()
    .map(row => [row.key, JSON.parse(row.value)]));
  // Existing imported tags can survive an edit even if their custom group was later removed.
  validateTagList(tags.filter(tag => !current.includes(tag)), customTagSet(groups), 'tags');
  return tags;
}

function mediaPathFor(sql, input, key, current) {
  if (!Object.hasOwn(input, key)) return current;
  const path = mediaPath(input[key]);
  if (path && !Object.hasOwn(catalog.metadata, path) && !sql.exec('SELECT 1 FROM media_objects WHERE path = ?', path).toArray().length) {
    throw new HttpError(422, 'A imagem selecionada está indisponível.');
  }
  return path;
}

function upsert(sql, table, item, position, previousTags = []) {
  const codec = tables.get(table);
  const row = encode(item, position, codec);
  const fields = codec.fields;
  sql.exec(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${fields.filter(field => field !== 'id').map(field => `${field} = excluded.${field}`).join(', ')}`,
  ...fields.map(field => row[field]));
  if (codec.tags && JSON.stringify(item.tags ?? []) !== JSON.stringify(previousTags)) {
    sql.exec(`DELETE FROM ${codec.tags} WHERE entity_id = ?`, item.id);
    for (const [index, tag] of (item.tags ?? []).entries()) {
      sql.exec(`INSERT INTO ${codec.tags} (entity_id, tag, position) VALUES (?, ?, ?)`, item.id, tag, index);
    }
  }
}

function versioned(sql, table, id, expected) {
  if (!expected) throw new HttpError(428, 'Abra o registro antes de salvar.');
  const before = recordFor(sql, table, validateId(id));
  if (before.version !== expected) throw new HttpError(409, 'O registro mudou desde que você abriu. Recarregue para comparar as alterações.');
  return before;
}

function recordPosition(sql, table) {
  return sql.exec(`SELECT coalesce(max(position) + 1, 0) AS next FROM ${table}`).one().next;
}

function nextCardPosition(sql, card) {
  return sql.exec('SELECT coalesce(max(position) + 1, 0) AS next FROM cards WHERE category = ? AND slot = ?', card.category, card.slot).one().next;
}

function changeClass(sql, before, input) {
  const { item, position } = before;
  const next = { ...item, ...textFields(input, classFields), tags: tagsFor(sql, input, item.tags),
    imagePath: mediaPathFor(sql, input, 'imagePath', item.imagePath) };
  if (typeof input.official === 'boolean') next.official = input.official;
  upsert(sql, 'classes', next, position, item.tags);
}

function changeKeyword(sql, before, input, id) {
  const item = { ...before?.item, id, ...textFields(input, { name: 120, effect: 12000 }) };
  item.name = normalizeKeywordName(item.name);
  item.effect ??= '';
  if (!item.name) throw new HttpError(422, 'Preencha o nome.');
  const duplicate = sql.exec('SELECT name FROM keywords WHERE id <> ?', id).toArray()
    .some(entry => keywordNameKey(entry.name) === keywordNameKey(item.name));
  if (duplicate) throw new HttpError(409, 'Já existe uma keyword com esse nome.');
  upsert(sql, 'keywords', item, before?.position ?? recordPosition(sql, 'keywords'));
}

function newCard(sql, input, id, now) {
  const category = input.category ?? 'class';
  if (!categories.includes(category)) throw new HttpError(422, 'Categoria inválida.');
  const owner = input.ownerId ? ancestry(sql, validateId(input.ownerId)) : [];
  if (input.ownerId && !owner.length) throw new HttpError(422, 'Classe de origem indisponível.');
  const root = owner[0];
  const slot = root ? Number(root.slot.slice(3)) : Number(input.slot ?? 0);
  if (!Number.isInteger(slot) || slot < 0 || slot > 14) throw new HttpError(422, 'Slot inválido.');
  return {
    id, category, slot, source: { kind: 'independent', skillId: null }, status: 'RASCUNHO',
    type: 'Skill', element: 'Neutral', cost: '0', ruleText: '', flavourText: '', artPath: null, workflowStatus: 'draft',
    artZoomPercent: 100, artOffsetXPercent: 0, artOffsetYPercent: 0,
    tags: [], createdAt: now, updatedAt: now, confirmedAt: null, confirmedRevision: null, confirmedGameplayHash: null,
    sourceRevisionAtSync: 1, divergence: { hasPendingSourceChanges: false, fields: [] },
    ...(owner.length ? { layoutClassId: owner.at(-1).id } : {})
  };
}

function changeCard(sql, before, input, id, action, revision) {
  const now = new Date().toISOString();
  const previous = before?.item;
  const next = { ...(previous ?? newCard(sql, input, id, now)), ...textFields(input, cardFields), ...visualFields(input) };
  if (!next.name) throw new HttpError(422, 'Preencha o nome.');
  if (next.type === 'Class Mechanic' && previous?.type !== 'Class Mechanic' || previous?.type === 'Class Mechanic' && next.type !== 'Class Mechanic') {
    throw new HttpError(422, 'O tipo de uma mecânica de classe é fixo.');
  }
  next.artPath = mediaPathFor(sql, input, 'artPath', next.artPath);
  for (const field of ['goldMaskPath', 'prismMaskPath', 'sceneBackPath', 'sceneMidPath', 'sceneFrontPath', 'sceneSmokePath']) {
    if (!Object.hasOwn(input, field) && next.artPath === previous?.artPath) continue;
    next[field] = mediaPathFor(sql, input, field, null);
    if ((field === 'goldMaskPath' || field === 'prismMaskPath') && next[field] && !next.artPath) throw new HttpError(422, 'Adicione a arte antes de aplicar máscaras ou camadas.');
  }
  const planeCount = [next.sceneBackPath, next.sceneMidPath, next.sceneFrontPath].filter(Boolean).length;
  if ((planeCount || next.sceneSmokePath) && planeCount !== 3) throw new HttpError(422, 'Envie os três planos da cena juntos.');
  if (Object.hasOwn(input, 'sceneSettings')) {
    if (!validSceneSettings(input.sceneSettings)) throw new HttpError(422, 'Ajustes de camadas inválidos.');
    next.sceneSettings = input.sceneSettings;
  }
  if (!planeCount) next.sceneSettings = null;
  const sceneChanged = Object.values(sceneLayerPaths).some(field => (next[field] ?? null) !== (previous?.[field] ?? null))
    || JSON.stringify(next.sceneSettings ?? null) !== JSON.stringify(previous?.sceneSettings ?? null);
  if (!planeCount || sceneChanged && !Object.hasOwn(input, 'scenePosterPath')) next.scenePosterPath = null;
  else if (Object.hasOwn(input, 'scenePosterPath')) next.scenePosterPath = mediaPathFor(sql, input, 'scenePosterPath', null);
  next.tags = tagsFor(sql, input, next.tags);
  syncElementTag(next, previous);
  const isNote = Boolean(next.noteOwnerId && next.noteTier);
  validateCardBody(next, id, isNote && action !== 'confirm' && next.status !== 'CONFIRMADO');
  if (previous?.status === 'CONFIRMADO' && gameplayHash(previous) !== gameplayHash(next)) {
    throw new HttpError(409, 'Reabra a carta antes de editar seus campos de gameplay.');
  }
  if (!previous || previous.name !== next.name) next.legacyName = next.name;
  if (action === 'confirm' && next.status !== 'CONFIRMADO') {
    if (!next.ruleText.trim()) throw new HttpError(422, 'Preencha o texto de regra antes de confirmar.');
    Object.assign(next, { status: 'CONFIRMADO', confirmedAt: now, confirmedRevision: revision, confirmedGameplayHash: gameplayHash(next) });
  }
  if (action === 'unconfirm' && next.status === 'CONFIRMADO') {
    Object.assign(next, { status: 'RASCUNHO', confirmedAt: null, confirmedRevision: null, confirmedGameplayHash: null,
      divergence: { hasPendingSourceChanges: false, fields: [] } });
    if (next.source.kind === 'skill') {
      const skill = recordFor(sql, 'skills', next.source.skillId).item;
      next.sourceSnapshot = { name: skill.name, tags: skill.tags, classId: skill.classId, rootClassId: next.source.rootClassId };
    }
  }
  const withoutTimestamp = { ...next, updatedAt: previous?.updatedAt ?? now };
  next.updatedAt = !previous || JSON.stringify(withoutTimestamp) !== JSON.stringify(previous) ? now : previous.updatedAt;
  upsert(sql, 'cards', next, before?.position ?? nextCardPosition(sql, next), previous?.tags);
}

function saveSkill(sql, before, input, id) {
  const previous = before?.item;
  const classId = previous?.classId ?? validateId(input.classId);
  const owner = ancestry(sql, classId);
  if (!owner.length) throw new HttpError(422, 'Classe indisponível.');
  const item = { ...previous, id, classId, cardId: previous?.cardId ?? 'card-' + crypto.randomUUID(),
    ...textFields(input, { name: 160, kind: 32, lcsNotes: 12000, mobileNotes: 12000 }), tags: tagsFor(sql, input, previous?.tags) };
  if (!item.name || !skillKinds.includes(item.kind)) throw new HttpError(422, 'Preencha o nome e selecione o tipo de skill.');
  const priorCard = previous ? recordFor(sql, 'cards', item.cardId).item : null;
  const now = new Date().toISOString();
  const card = { ...(priorCard ?? newCard(sql, { ownerId: classId }, item.cardId, now)), updatedAt: priorCard?.updatedAt ?? now };
  const snapshot = { name: item.name, tags: item.tags, classId, rootClassId: owner[0].id };
  card.source = { kind: 'skill', skillId: id, classId, rootClassId: owner[0].id };
  if (card.status === 'CONFIRMADO') {
    card.divergence = sourceDiff(card.sourceSnapshot, snapshot);
  } else {
    if (!priorCard || priorCard.name === priorCard.sourceSnapshot?.name) card.name = item.name;
    if (!priorCard || JSON.stringify(card.tags.filter(tag => tag !== card.element)) === JSON.stringify(priorCard.sourceSnapshot?.tags ?? [])) {
      card.tags = [...item.tags];
      syncElementTag(card);
    }
    card.sourceSnapshot = snapshot;
    card.divergence = { hasPendingSourceChanges: false, fields: [] };
  }
  const cardWithoutTimestamp = { ...card, updatedAt: priorCard?.updatedAt ?? now };
  card.updatedAt = !priorCard || JSON.stringify(cardWithoutTimestamp) !== JSON.stringify(priorCard) ? now : priorCard.updatedAt;
  upsert(sql, 'skills', item, before?.position ?? recordPosition(sql, 'skills'), previous?.tags);
  upsert(sql, 'cards', card, priorCard?.position ?? nextCardPosition(sql, card), priorCard?.tags);
}

function copiedName(name, fallback = 'Skill') {
  const suffix = ' (Copy)';
  const base = String(name || fallback).slice(0, 160 - suffix.length).trimEnd();
  return base + suffix;
}

function duplicateSkillRecords(sql, source, skillId, cardId, now) {
  const owner = ancestry(sql, source.classId);
  if (!owner.length) throw new HttpError(409, 'A classe desta skill não está disponível.');
  const originalCard = recordFor(sql, 'cards', source.cardId);
  if (originalCard.item.source?.kind !== 'skill' || originalCard.item.source.skillId !== source.id || originalCard.item.type === 'Class Mechanic') {
    throw new HttpError(409, 'A carta vinculada não pode ser duplicada como skill.');
  }

  const item = { ...source, id: skillId, cardId, name: copiedName(source.name) };
  const snapshot = { name: item.name, tags: item.tags, classId: item.classId, rootClassId: owner[0].id };
  const card = {
    ...originalCard.item,
    id: cardId,
    name: copiedName(originalCard.item.name, source.name),
    source: { kind: 'skill', skillId, classId: item.classId, rootClassId: owner[0].id },
    status: 'RASCUNHO',
    workflowStatus: 'draft',
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    confirmedRevision: null,
    confirmedGameplayHash: null,
    sourceSnapshot: snapshot,
    sourceRevisionAtSync: 1,
    divergence: { hasPendingSourceChanges: false, fields: [] },
  };
  syncElementTag(card);

  upsert(sql, 'skills', item, recordPosition(sql, 'skills'));
  upsert(sql, 'cards', card, nextCardPosition(sql, card));
  return { item, card };
}

function moveClassCard(sql, before, destinationClassId, now) {
  const { item, position } = before;
  if (item.category !== 'class' || item.status !== 'RASCUNHO' || item.source?.kind !== 'independent'
    || item.source?.skillId || item.noteOwnerId || item.noteTier || item.type === 'Class Mechanic') {
    throw new HttpError(409, 'Só uma carta independente de classe em rascunho pode mudar de posição.');
  }
  const currentClassId = item.layoutClassId ?? `base_${item.slot}`;
  const currentPath = ancestry(sql, currentClassId);
  const targetPath = ancestry(sql, validateId(destinationClassId));
  const actualCurrentClass = currentPath.at(-1);
  const currentClass = actualCurrentClass?.tier === 'SPEC' ? currentPath.at(-2) : actualCurrentClass;
  const targetClass = targetPath.at(-1);
  if (!currentPath.length || !targetPath.length || !['C1', 'C2', 'C3'].includes(currentClass.tier)
    || !['C1', 'C2', 'C3'].includes(targetClass.tier)) {
    throw new HttpError(422, 'Escolha uma classe C1, C2 ou C3 como destino.');
  }
  const recordedClassId = item.layoutClassId ?? currentPath[0].id;
  if (recordedClassId === targetClass.id) return { item, position, unchanged: true, from: currentClass, to: targetClass };

  const { layoutClassId: _layoutClassId, ...withoutLayoutClass } = item;
  const next = {
    ...withoutLayoutClass,
    slot: Number(targetPath[0].slot.slice(3)),
    updatedAt: now,
    ...(targetClass.tier === 'C1' ? {} : { layoutClassId: targetClass.id }),
  };
  const nextPosition = next.slot === item.slot ? position : nextCardPosition(sql, next);
  upsert(sql, 'cards', next, nextPosition, item.tags);
  return { item: next, position: nextPosition, unchanged: false, from: currentClass, to: targetClass };
}

function archiveLinks(sql, id, now) {
  sql.exec(`UPDATE links SET details = json_set(details, '$[0].archived', json('true'), '$[0].archivedAt', ?, '$[0].archiveReason', 'entity-deleted')
    WHERE (json_extract(details, '$[0].from') = ? OR json_extract(details, '$[0].to') = ?)
    AND coalesce(json_extract(details, '$[0].archived'), 0) = 0`, now, id, id);
}

function removeRecord(sql, table, before, input) {
  const { item } = before;
  const now = new Date().toISOString();
  if (table === 'classes') throw new HttpError(405, 'Os slots de classe são fixos.');
  if (table === 'cards' && (item.status === 'CONFIRMADO' || item.source.kind === 'skill' || item.type === 'Class Mechanic')) {
    throw new HttpError(409, 'A carta está confirmada ou vinculada a uma skill ou classe.');
  }
  if (table === 'skills') {
    const { item: card, position } = recordFor(sql, 'cards', item.cardId);
    if (input.disposition === 'keep-card') {
      const kept = { ...card, source: { kind: 'independent', skillId: null },
        divergence: { hasPendingSourceChanges: false, fields: [] }, updatedAt: now };
      upsert(sql, 'cards', kept, position, card.tags);
    } else if (input.disposition === 'delete-card' && card.status === 'RASCUNHO') {
      sql.exec('DELETE FROM cards WHERE id = ?', card.id);
      archiveLinks(sql, card.id, now);
    } else {
      throw new HttpError(409, 'Escolha o destino da carta. Cartas confirmadas precisam ser reabertas para exclusão.');
    }
  }
  sql.exec(`DELETE FROM ${table} WHERE id = ?`, item.id);
  archiveLinks(sql, item.id, now);
}

export function mutateCatalog(storage, { table, id, expected, input, owner, action, idempotencyKey }) {
  const { sql } = storage;
  return storage.transactionSync(() => {
    const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
    if (!head) throw new HttpError(409, 'Importe o Vault antes de editar.');
    let requestHash;
    if ((action === 'create' || action === 'duplicate' || action === 'move') && idempotencyKey) {
      const request = action === 'create' ? input : { action, table, id, expected, input };
      requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      const existing = sql.exec(`SELECT request_hash, response_json FROM mutation_idempotency
        WHERE actor = ? AND resource = ? AND key = ?`, owner, table, idempotencyKey).toArray()[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new HttpError(409, 'Esta chave de repetição já foi usada com outros dados.', 'IDEMPOTENCY_KEY_REUSED');
        }
        return JSON.parse(existing.response_json);
      }
      const expiredBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      sql.exec('DELETE FROM mutation_idempotency WHERE created_at < ?', expiredBefore);
    }
    if (action === 'duplicate') {
      if (table !== 'skills' || !id || !idempotencyKey) throw new HttpError(422, 'Duplicação de skill inválida.');
      const source = versioned(sql, 'skills', id, expected).item;
      const revision = head.revision + 1;
      const now = new Date().toISOString();
      const created = duplicateSkillRecords(sql, source, 'skill-' + crypto.randomUUID(), 'card-' + crypto.randomUUID(), now);
      const transaction = 'tx-' + crypto.randomUUID();
      sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, now, owner, `duplicate skills/${created.item.id}`);
      writeAudit(sql, {
        revision, actor: owner, action: 'duplicate', resource: 'skill', resourceId: created.item.id,
        resourceName: created.item.name, changedFields: changedFields({}, created.item),
        details: { sourceId: id, related: [{ resource: 'cards', id: created.card.id, name: created.card.name, operation: 'created' }] }, createdAt: now,
      });
      sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, now);
      const result = { ...recordFor(sql, 'skills', created.item.id), revision, duplicatedFrom: id };
      sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, owner, table, idempotencyKey, requestHash, JSON.stringify(result), now);
      return result;
    }
    if (action === 'move') {
      if (table !== 'cards' || !id || !idempotencyKey) throw new HttpError(422, 'A mudança de posição exige uma carta, destino e chave de repetição.');
      const before = versioned(sql, 'cards', id, expected);
      const revision = head.revision + 1;
      const now = new Date().toISOString();
      const moved = moveClassCard(sql, before, input.destinationClassId, now);
      if (moved.unchanged) {
        const result = { ...before, revision: head.revision, unchanged: true };
        sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`, owner, table, idempotencyKey, requestHash, JSON.stringify(result), now);
        return result;
      }
      const transaction = 'tx-' + crypto.randomUUID();
      sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, now, owner, `move cards/${id}`);
      writeAudit(sql, {
        revision, actor: owner, action: 'move', resource: 'card', resourceId: id, resourceName: moved.item.name,
        changedFields: changedFields(before.item, moved.item),
        details: {
          from: { classId: moved.from.id, tier: moved.from.tier, rootClassId: before.item.layoutClassId ? ancestry(sql, before.item.layoutClassId)[0]?.id : `base_${before.item.slot}`, slot: before.item.slot },
          to: { classId: moved.to.id, tier: moved.to.tier, rootClassId: ancestry(sql, moved.to.id)[0]?.id, slot: moved.item.slot },
        }, createdAt: now,
      });
      sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, now);
      const result = { ...recordFor(sql, 'cards', id), revision };
      sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, owner, table, idempotencyKey, requestHash, JSON.stringify(result), now);
      return result;
    }
    const before = id ? versioned(sql, table, id, expected) : null;
    const linkedBefore = table === 'skills' && before ? recordFor(sql, 'cards', before.item.cardId).item : null;
    const nextId = id ?? table.slice(0, -1) + '-' + crypto.randomUUID();
    const revision = head.revision + 1;
    if (action === 'delete') {
      removeRecord(sql, table, before, input);
    } else if (table === 'classes') {
      changeClass(sql, before, input);
    } else if (table === 'keywords') {
      changeKeyword(sql, before, input, nextId);
    } else if (table === 'skills') {
      saveSkill(sql, before, input, nextId);
    } else {
      changeCard(sql, before, input, nextId, action, revision);
    }
    const saved = action === 'delete' ? null : recordFor(sql, table, nextId);
    const linkedAfter = table === 'skills' && saved ? recordFor(sql, 'cards', saved.item.cardId).item : null;
    const linkedChanged = Boolean(linkedBefore && linkedAfter && JSON.stringify(linkedBefore) !== JSON.stringify(linkedAfter));
    if (before && saved && before.version === saved.version && !linkedChanged) return { ...saved, revision: head.revision, unchanged: true };

    const transaction = 'tx-' + crypto.randomUUID();
    const timestamp = new Date().toISOString();
    sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, timestamp, owner, action + ' ' + table + '/' + nextId);
    let related = [];
    if (table === 'skills' && linkedAfter && (!linkedBefore || JSON.stringify(linkedBefore) !== JSON.stringify(linkedAfter))) {
      related = [{ resource: 'cards', id: saved.item.cardId, name: linkedAfter.name, operation: linkedBefore ? 'updated' : 'created' }];
    } else if (table === 'skills' && linkedBefore && !linkedAfter) {
      related = [{ resource: 'cards', id: before.item.cardId, name: linkedBefore.name, operation: 'deleted' }];
    }
    const resourceName = { classes: 'class', cards: 'card', skills: 'skill', keywords: 'keyword' }[table] ?? table;
    const fields = action === 'delete'
      ? ['record']
      : before ? changedFields(before.item, saved.item) : changedFields({}, saved.item).filter(field => Object.hasOwn(input, field));
    writeAudit(sql, {
      revision, actor: owner, action, resource: resourceName, resourceId: nextId,
      resourceName: (saved?.item ?? before?.item)?.name ?? nextId,
      changedFields: fields, details: { related }, createdAt: timestamp
    });
    sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, timestamp);
    const result = action === 'delete' ? { id: nextId, revision, deleted: true } : { ...saved, revision };
    if (action === 'create' && idempotencyKey) {
      sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, owner, table, idempotencyKey, requestHash, JSON.stringify(result), timestamp);
    }
    return result;
  });
}

export function createClassNoteDraft(storage, { ownerId, tier, name, owner, idempotencyKey }) {
  const noteOwnerId = validateId(ownerId);
  if (!['C1', 'C2', 'C3'].includes(tier)) throw new HttpError(422, 'Escolha um tier de classe válido.');
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new HttpError(422, 'Use um nome de até 100 caracteres.');
  const cardName = name.trim();
  if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
    throw new HttpError(422, 'A criação exige uma chave de repetição válida.', 'INVALID_IDEMPOTENCY_KEY');
  }

  const { sql } = storage;
  return storage.transactionSync(() => {
    const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
    if (!head) throw new HttpError(409, 'Importe o Vault antes de criar uma carta.');
    const input = { ownerId: noteOwnerId, tier, name: cardName };
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = sql.exec(`SELECT request_hash, response_json FROM mutation_idempotency
      WHERE actor = ? AND resource = 'cards' AND key = ?`, owner, idempotencyKey).toArray()[0];
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new HttpError(409, 'Esta chave de repetição já foi usada com outros dados.', 'IDEMPOTENCY_KEY_REUSED');
      }
      return JSON.parse(existing.response_json);
    }
    const expiredBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    sql.exec('DELETE FROM mutation_idempotency WHERE created_at < ?', expiredBefore);

    const lineage = ancestry(sql, noteOwnerId);
    const noteOwner = lineage.at(-1);
    if (!noteOwner || noteOwner.tier !== 'C3') throw new HttpError(422, 'Uma Free Note só pode criar cartas a partir de uma classe C3.');
    const root = lineage[0];
    const associated = lineage.find(item => item.tier === tier);
    const slot = Number(root?.slot.slice(3));
    if (!root || !associated || !Number.isInteger(slot) || slot < 0 || slot > 14) {
      throw new HttpError(409, 'A classe não tem um caminho válido para este tier.');
    }

    const reference = resolveClassMentions(sql, { mentions: [{ line: 0, tier, name: cardName, ownerId: noteOwnerId }] }).items[0];
    if (reference?.status !== 'pending') {
      throw new HttpError(409, 'Já existe uma correspondência para este nome. Abra a referência existente.', 'MENTION_ALREADY_RESOLVES');
    }

    const now = new Date().toISOString();
    const id = 'card-' + crypto.randomUUID();
    const element = defaultElementForClassLineage(lineage);
    const card = {
      id,
      name: cardName,
      category: 'class',
      slot,
      type: '',
      element,
      cost: '',
      ruleText: '',
      flavourText: '',
      status: 'RASCUNHO',
      workflowStatus: 'draft',
      artPath: null,
      ownerId: noteOwnerId,
      layoutClassId: associated.id,
      noteOwnerId,
      noteTier: tier,
      source: { kind: 'independent', skillId: null },
      tags: [element],
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      confirmedRevision: null,
      confirmedGameplayHash: null,
      sourceRevisionAtSync: 1,
      divergence: { hasPendingSourceChanges: false, fields: [] },
    };
    validateCardBody(card, id, true);
    validateTagList(card.tags, customTagSet(Object.fromEntries(sql.exec("SELECT key, value FROM settings WHERE scope = 'customGroups'").toArray()
      .map(row => [row.key, JSON.parse(row.value)]))), `carta ${id}`);
    upsert(sql, 'cards', card, nextCardPosition(sql, card));

    const revision = head.revision + 1;
    const transaction = 'tx-' + crypto.randomUUID();
    sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, now, owner, `create cards/${id}`);
    writeAudit(sql, {
      revision,
      actor: owner,
      action: 'create',
      resource: 'card',
      resourceId: id,
      resourceName: cardName,
      changedFields: changedFields({}, card),
      details: { source: 'class-free-note', noteOwnerId, noteTier: tier, layoutClassId: associated.id },
      createdAt: now,
    });
    sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, now);
    const result = { ...recordFor(sql, 'cards', id), revision };
    sql.exec(`INSERT INTO mutation_idempotency (actor, resource, key, request_hash, response_json, created_at)
      VALUES (?, 'cards', ?, ?, ?, ?)`, owner, idempotencyKey, requestHash, JSON.stringify(result), now);
    return result;
  });
}
