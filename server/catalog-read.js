import { createHash } from 'node:crypto';
import { HttpError } from './http.js';
import { entities, decode } from './records.js';
import catalog from './catalog.generated.json';
import { readClassQuery } from '../shared/class-query.js';
import { classQueryCte, compileClassQueryRules } from './class-query-sql.js';

export const tiers = ['C1', 'C2', 'C3', 'SPEC'];
export const categories = ['class', 'enemy', 'neutral', 'equipment', 'species', 'status'];
export const statuses = ['RASCUNHO', 'CONFIRMADO'];
export const cardTypes = ['Attack', 'Skill', 'Power', 'Other', 'Class Mechanic'];
export const elements = ['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'];
export const skillKinds = ['Passive', 'Active', 'Signature', 'Ultimate'];

const supported = {
  classes: { columns: 't.id, t.name, t.tier, t.slot, t.parent_id AS parentId, t.concept, t.position', filters: { tier: tiers, parent_id: 'parent', id: 'id' }, tags: 'class_tags' },
  cards: {
    columns: "t.id, t.name, t.category, t.type, t.element, t.cost, t.status, t.workflow_status AS workflowStatus, substr(t.rule_text, 1, 280) AS ruleTextPreview, CASE WHEN t.visual_profile = 'full-art-v1' THEN substr(t.flavour_text, 1, 240) ELSE '' END AS flavourTextPreview, t.art_path AS artPath, json_extract(t.details, '$[0].scenePosterPath') AS scenePosterPath, t.name_font_size AS nameFontSize, t.type_font_size AS typeFontSize, t.element_font_size AS elementFontSize, t.rule_font_size AS ruleFontSize, t.flavour_font_size AS flavourFontSize, t.rule_text_offset_y AS ruleTextOffsetY, t.flavour_text_offset_y AS flavourTextOffsetY, t.art_zoom_percent AS artZoomPercent, t.art_offset_x_percent AS artOffsetXPercent, t.art_offset_y_percent AS artOffsetYPercent, t.visual_profile AS visualProfile, t.owner_id AS ownerId, t.slot, c.id AS layoutClassId, COALESCE(c.name, rootClass.name) AS ownerName, COALESCE(c.tier, rootClass.tier) AS ownerTier, COALESCE(c.slot, rootClass.slot) AS ownerSlot",
    join: "LEFT JOIN skills s ON t.skill_id = s.id LEFT JOIN classes c ON c.id = COALESCE(json_extract(t.details, '$[0].layoutClassId'), t.owner_id, s.class_id) LEFT JOIN classes rootClass ON rootClass.id = 'base_' || t.slot AND t.category = 'class'",
    filters: { category: categories, status: statuses, type: cardTypes, cost: ['0', '1', '2', '3', '4', '5', 'X'], element: elements, owner_id: 'owner' }, tags: 'card_tags'
  },
  skills: {
    columns: 't.id, t.name, t.kind, t.class_id AS classId, t.card_id AS cardId, c.name AS className, c.slot',
    join: 'JOIN classes c ON t.class_id = c.id',
    filters: { kind: skillKinds, class_id: 'class' }, tags: 'skill_tags'
  },
  keywords: { columns: 't.id, t.name, substr(t.effect, 1, 300) AS effect', filters: {} }
};

function classSlotOrder(alias) {
  const index = marker => `CASE WHEN instr(${alias}.slot, '${marker}') = 0 THEN 0 ELSE CAST(substr(${alias}.slot, instr(${alias}.slot, '${marker}') + ${marker.length}, 2) AS INTEGER) END`;
  const root = `CAST(substr(${alias}.slot, 4, CASE WHEN instr(${alias}.slot, '/') > 0 THEN instr(${alias}.slot, '/') - 4 ELSE length(${alias}.slot) END) AS INTEGER)`;
  return `(${root} * 1000000 + ${index('/C2_')} * 10000 + ${index('/C3_')} * 100 + ${index('/SPEC_')})`;
}

const sortableFields = {
  classes: {
    name: 'lower(t.name)', tier: "CASE t.tier WHEN 'C1' THEN 0 WHEN 'C2' THEN 1 WHEN 'C3' THEN 2 ELSE 3 END",
    slot: classSlotOrder('t'), concept: "lower(COALESCE(t.concept, ''))",
  },
  cards: {
    name: 'lower(t.name)', category: "lower(t.category)", type: 'lower(t.type)', element: 'lower(t.element)',
    cost: "CASE upper(COALESCE(t.cost, '')) WHEN 'X' THEN 7 ELSE CAST(t.cost AS INTEGER) END",
    status: 'lower(t.status)', ownerName: "lower(COALESCE(c.name, rootClass.name, ''))",
  },
  skills: { name: 'lower(t.name)', kind: 'lower(t.kind)', className: 'lower(c.name)', slot: classSlotOrder('c') },
  keywords: { name: 'lower(t.name)', effect: "lower(COALESCE(t.effect, ''))" },
};

export function settingsFor(table) {
  return Object.hasOwn(supported, table) ? supported[table] : null;
}

export function validateId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) throw new HttpError(422, 'Identificador inválido.');
  return id;
}

function classQueryFor(params) {
  try { return readClassQuery(params); }
  catch {
    if (params.has('tagSource') && !['direct', 'effective'].includes(params.get('tagSource'))) {
      throw new HttpError(422, 'Origem das tags inválida.');
    }
    throw new HttpError(422, 'Consulta de classes inválida.');
  }
}

function searchTerms(text) {
  const tokens = text.normalize('NFKC').match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
  return tokens.map(token => '"' + token + '"*').join(' ');
}

function tagLists(sql, table, ids) {
  if (!table || !ids.length) return new Map();
  const rows = sql.exec(`SELECT entity_id, tag FROM ${table}
    WHERE entity_id IN (SELECT value FROM json_each(?)) ORDER BY entity_id, position`, JSON.stringify(ids)).toArray();
  return Map.groupBy(rows, row => row.entity_id);
}

const rootId = slot => slot ? 'base_' + /^C1_(\d+)/.exec(slot)?.[1] : null;

function addArt(table, row) {
  if (table === 'classes' || table === 'skills') {
    const id = rootId(row.slot);
    return {
      ...row,
      icon: id ? '/thumbs/' + id + '.webp' : null,
      ...(table === 'classes' ? { artwork: id ? catalog.palette.references[id]?.bgPath ?? null : null } : {})
    };
  }
  if (table === 'cards') {
    const id = rootId(row.ownerSlot);
    return {
      ...row,
      ownerIcon: id ? '/thumbs/' + id + '.webp' : null,
      ownerArtwork: id ? catalog.palette.references[id]?.bgPath ?? null : null
    };
  }
  return row;
}

export function listRecords(sql, table, params, { maxLimit = 50 } = {}) {
  const config = settingsFor(table);
  if (params.has('where') && !['classes', 'skills'].includes(table)) throw new HttpError(422, 'Consulta de classes indisponível para este tipo de registro.');
  const classQuery = table === 'classes' || params.has('where') ? classQueryFor(params) : null;
  const classAlias = table === 'skills' ? 'c' : 't';
  const clauses = [];
  const bindings = [];
  let join = config.join ?? '';
  const rawSearch = (params.get('q') ?? '').trim().slice(0, 120);
  const phrase = searchTerms(rawSearch);
  if (table === 'cards' && rawSearch) {
    clauses.push(`(t.rowid IN (SELECT rowid FROM cards_search WHERE cards_search MATCH ?) OR instr(lower(t.type), lower(?)) > 0 OR instr(lower(t.element), lower(?)) > 0
      OR EXISTS (SELECT 1 FROM card_tags search_tags WHERE search_tags.entity_id = t.id AND instr(lower(search_tags.tag), lower(?)) > 0))`);
    bindings.push(phrase || '"__no_text_match__"', rawSearch, rawSearch, rawSearch);
  } else if (phrase) {
    join += ` JOIN ${table}_search ON ${table}_search.rowid = t.rowid`;
    clauses.push(`${table}_search MATCH ?`);
    bindings.push(phrase);
  }
  for (const [column, values] of Object.entries(config.filters)) {
    const key = Array.isArray(values) ? column : values;
    const selected = Array.isArray(values) ? [...new Set(params.getAll(key).filter(Boolean))] : [params.get(key)];
    if (!selected.length || !selected[0]) continue;
    if (Array.isArray(values)) {
      if (selected.some(value => !values.includes(value))) throw new HttpError(422, 'Filtro inválido.');
      clauses.push(selected.length === 1
        ? `t.${column} = ?`
        : `t.${column} IN (${selected.map(() => '?').join(', ')})`);
      bindings.push(...selected);
    } else {
      validateId(selected[0]);
      clauses.push(`t.${column} = ?`);
      bindings.push(selected[0]);
    }
  }
  const lineage = params.get('lineage');
  if (lineage && table === 'classes') {
    if (!/^C1_(?:[0-9]|1[0-4])$/.test(lineage)) throw new HttpError(422, 'Linhagem inválida.');
    clauses.push('(t.slot = ? OR (t.slot >= ? AND t.slot < ?))');
    bindings.push(lineage, lineage + '/', lineage + '0');
  }
  const origin = params.get('origin');
  if (origin && table === 'cards') {
    if (origin === 'independent') {
      clauses.push('t.owner_id IS NULL AND t.skill_id IS NULL');
    } else {
      if (!/^C1_(?:[0-9]|1[0-4])$/.test(origin)) throw new HttpError(422, 'Origem inválida.');
      clauses.push(`((c.slot = ? OR (c.slot >= ? AND c.slot < ?))
        OR (c.id IS NULL AND t.category = 'class' AND t.slot = ?))`);
      const upper = origin + '0';
      bindings.push(origin, origin + '/', upper, Number(origin.slice(3)));
    }
  }
  const family = params.get('family');
  const classId = params.get('classId');
  const comparedClassIds = [...new Set(params.getAll('compareClass').filter(Boolean))];
  if ((family || classId) && (table !== 'cards' || params.get('category') !== 'class')) {
    throw new HttpError(422, 'O escopo de classe só pode ser usado nas cartas de classe.');
  }
  if (comparedClassIds.length && (table !== 'cards' || params.get('category') !== 'class')) {
    throw new HttpError(422, 'A comparação de classes só pode ser usada nas cartas de classe.');
  }
  const selectedTiers = [...new Set(params.getAll('tier').filter(Boolean))];
  if (selectedTiers.length) {
    if (table !== 'cards' || params.get('category') !== 'class' || selectedTiers.some(tier => !tiers.includes(tier))) {
      throw new HttpError(422, 'Filtro C-Tier inválido.');
    }
    const tierClauses = [];
    tierClauses.push(`c.tier IN (${selectedTiers.map(() => '?').join(', ')})`);
    bindings.push(...selectedTiers);
    if (selectedTiers.includes('C1')) tierClauses.push("(c.id IS NULL AND t.category = 'class')");
    clauses.push('(' + tierClauses.join(' OR ') + ')');
  }
  const group = params.get('group');
  if (group !== null) {
    const slot = Number(group);
    if (table !== 'cards' || params.get('category') === 'class' || !/^\d{1,2}$/.test(group) || !Number.isInteger(slot) || slot < 0 || slot > 14) {
      throw new HttpError(422, 'Grupo de coleção inválido.');
    }
    clauses.push('t.slot = ?');
    bindings.push(slot);
  }
  let selectedClass = null;
  if (comparedClassIds.length) {
    const comparedClasses = comparedClassIds.map(validateId);
    if (comparedClasses.length > 315) throw new HttpError(422, 'Selecione até 315 classes para comparação.');
    const rows = sql.exec('SELECT id, tier, slot FROM classes WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(comparedClasses)).toArray();
    if (rows.length !== comparedClasses.length || rows.some(item => !['C1', 'C2', 'C3'].includes(item.tier))) {
      throw new HttpError(422, 'Uma das classes selecionadas não está disponível para comparação.');
    }
    const legacyRootSlots = rows.filter(item => item.tier === 'C1').map(item => Number(item.slot.slice(3)));
    clauses.push(`(c.id IN (SELECT value FROM json_each(?))
      OR (c.id IS NULL AND t.category = 'class' AND t.slot IN (SELECT value FROM json_each(?))))`);
    bindings.push(JSON.stringify(comparedClasses), JSON.stringify(legacyRootSlots));
  } else if (classId) {
    selectedClass = sql.exec('SELECT id, tier, slot FROM classes WHERE id = ?', validateId(classId)).toArray()[0];
    if (!selectedClass || !['C1', 'C2', 'C3'].includes(selectedClass.tier)) throw new HttpError(422, 'Classe de galeria inválida.');
    if (family && selectedClass.slot.split('/')[0] !== family) throw new HttpError(422, 'A classe selecionada não pertence à linhagem informada.');
    const legacyRootSlot = selectedClass.tier === 'C1' ? Number(selectedClass.slot.slice(3)) : null;
    clauses.push(legacyRootSlot === null
      ? 'c.id = ?'
      : `(c.id = ? OR (c.id IS NULL AND t.category = 'class' AND t.slot = ?))`);
    bindings.push(selectedClass.id);
    if (legacyRootSlot !== null) bindings.push(legacyRootSlot);
  } else if (family) {
    if (!/^C1_(?:[0-9]|1[0-4])$/.test(family)) throw new HttpError(422, 'Linhagem inválida.');
    const root = sql.exec("SELECT id FROM classes WHERE tier = 'C1' AND slot = ?", family).toArray()[0];
    if (!root) throw new HttpError(422, 'Linhagem indisponível.');
    const upper = family + '0';
    clauses.push(`((c.slot = ? OR (c.slot >= ? AND c.slot < ?))
      OR (c.id IS NULL AND t.category = 'class' AND t.slot = ?))`);
    bindings.push(family, family + '/', upper, Number(family.slice(3)));
  }
  const compiledClassQuery = classQuery ? compileClassQueryRules(classQuery, classAlias) : null;
  if (compiledClassQuery?.predicate) {
    clauses.push(compiledClassQuery.predicate);
    bindings.push(...compiledClassQuery.bindings);
  }

  const selectedTags = classQuery ? [] : [...new Set(params.getAll('tag').map(value => value.trim()).filter(Boolean))];
  if (selectedTags.length) {
    if (!config.tags || selectedTags.length > 10 || selectedTags.some(tag => tag.length > 80)) throw new HttpError(422, 'Filtro de tags inválido.');
    const tagSource = params.get('tagSource') ?? 'direct';
    if (tagSource !== 'direct' && tagSource !== 'effective') throw new HttpError(422, 'Origem das tags inválida.');
    if (tagSource !== 'direct') throw new HttpError(422, 'Tags efetivas só podem ser consultadas em classes.');
    clauses.push(`EXISTS (SELECT 1 FROM ${config.tags} g WHERE g.entity_id = t.id AND g.tag IN (${selectedTags.map(() => '?').join(', ')})
      GROUP BY g.entity_id HAVING count(DISTINCT g.tag) = ?)`);
    bindings.push(...selectedTags, selectedTags.length);
  }
  const galleryOrder = table === 'cards' && params.get('category') === 'class';
  const collectionOrder = table === 'cards' && !galleryOrder;
  const requestedSort = params.get('sort');
  const requestedDirection = params.get('dir') ?? 'asc';
  if ((requestedSort && !Object.hasOwn(sortableFields[table], requestedSort))
    || (params.has('dir') && !requestedSort)
    || !['asc', 'desc'].includes(requestedDirection)) {
    throw new HttpError(422, 'Ordenação inválida.');
  }
  const requestedOrder = requestedSort ? { expression: sortableFields[table][requestedSort], direction: requestedDirection } : null;
  const sortExpressions = requestedOrder ? [requestedOrder.expression, 't.id'] : galleryOrder ? [
    'CAST(t.slot AS INTEGER)',
    "CASE WHEN instr(COALESCE(c.slot, ''), '/C2_') > 0 THEN CAST(substr(c.slot, instr(c.slot, '/C2_') + 4, 2) AS INTEGER) ELSE -1 END",
    "CASE WHEN instr(COALESCE(c.slot, ''), '/C3_') > 0 THEN CAST(substr(c.slot, instr(c.slot, '/C3_') + 4, 2) AS INTEGER) ELSE -1 END",
    "CASE WHEN substr(COALESCE(t.name, ''), 1, 1) = '☺' THEN 1 ELSE 0 END",
    "CASE lower(trim(COALESCE(t.type, ''))) WHEN 'class mechanic' THEN 0 WHEN 'mechanic' THEN 0 WHEN 'power' THEN 1 WHEN 'attack' THEN 2 WHEN 'skill' THEN 3 ELSE 4 END",
    "CASE WHEN upper(t.cost) = 'X' THEN 0 WHEN t.cost IN ('0', '1', '2', '3', '4', '5') THEN CAST(t.cost AS INTEGER) + 1 ELSE 7 END",
    "(CASE WHEN substr(COALESCE(t.name, ''), 1, 1) = '☺' THEN substr(t.name, 2) ELSE t.name END) COLLATE NOCASE",
    't.id'
  ] : collectionOrder ? [
    "CASE t.category WHEN 'class' THEN 0 WHEN 'enemy' THEN 1 WHEN 'neutral' THEN 2 WHEN 'equipment' THEN 3 WHEN 'species' THEN 4 WHEN 'status' THEN 5 ELSE 6 END",
    'CAST(t.slot AS INTEGER)', 't.position', 't.name COLLATE NOCASE', 't.id'
  ] : ['t.name COLLATE NOCASE', 't.id'];
  const after = params.get('after');
  if (after) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(after, 'base64url').toString('utf8')); } catch {}
    if (requestedOrder) {
      const sortValueValid = requestedSort === 'cost'
        ? Number.isInteger(cursor?.[0]) && cursor[0] >= 0 && cursor[0] <= 7
        : requestedSort === 'slot'
          ? Number.isInteger(cursor?.[0]) && cursor[0] >= 0 && cursor[0] <= 15000000
        : typeof cursor?.[0] === 'string' && cursor[0].length <= 512;
      if (!Array.isArray(cursor) || cursor.length !== 2 || !sortValueValid || typeof cursor[1] !== 'string') {
        throw new HttpError(422, 'Página inválida.');
      }
      validateId(cursor[1]);
    } else if (galleryOrder) {
      if (!Array.isArray(cursor) || cursor.length !== 8
        || cursor.slice(0, 6).some(value => !Number.isInteger(value))
        || typeof cursor[6] !== 'string' || cursor[6].length > 512
        || typeof cursor[7] !== 'string') throw new HttpError(422, 'Página inválida.');
      validateId(cursor[7]);
    } else if (collectionOrder
      ? !Array.isArray(cursor) || cursor.length !== 5 || cursor.slice(0, 3).some(value => !Number.isInteger(value)) || typeof cursor[3] !== 'string' || cursor[3].length > 512 || typeof cursor[4] !== 'string'
      : !Array.isArray(cursor) || cursor.length !== 2 || typeof cursor[0] !== 'string' || cursor[0].length > 512) {
      throw new HttpError(422, 'Página inválida.');
    }
    if (requestedOrder) {
      const comparison = requestedOrder.direction === 'desc' ? '<' : '>';
      clauses.push(`(${requestedOrder.expression} ${comparison} ? OR (${requestedOrder.expression} = ? AND t.id > ?))`);
      bindings.push(cursor[0], cursor[0], validateId(cursor[1]));
    } else {
      clauses.push(`(${sortExpressions.join(', ')}) > (${sortExpressions.map(() => '?').join(', ')})`);
    }
    if (requestedOrder) { /* The selected order has a direction-aware cursor above. */ }
    else if (galleryOrder) bindings.push(...cursor.slice(0, 6), cursor[6], cursor[7]);
    else if (collectionOrder) bindings.push(...cursor.slice(0, 3), cursor[3], validateId(cursor[4]));
    else bindings.push(cursor[0], validateId(cursor[1]));
  }
  const limit = Number(params.get('limit') ?? '24');
  if (!Number.isInteger(maxLimit) || maxLimit < 1 || maxLimit > 10000) throw new Error('Invalid internal catalog page limit.');
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new HttpError(422, `O limite deve estar entre 1 e ${maxLimit}.`);
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const sortColumns = requestedOrder || galleryOrder || collectionOrder ? sortExpressions.map((expression, index) => `${expression} AS __sort${index}`).join(', ') : '';
  const selectedColumns = table === 'classes' && lineage
    ? `${config.columns}, CASE WHEN t.tier = 'C3' THEN length(COALESCE(t.notes, '')) ELSE 0 END AS notesLength,
      CASE WHEN t.tier = 'C3' THEN substr(COALESCE(t.notes, ''), 1, 180) ELSE '' END AS notesPreview`
    : config.columns;
  const classQueryCteSql = classQueryCte(compiledClassQuery ?? {});
  const orderBy = requestedOrder
    ? `${requestedOrder.expression} ${requestedOrder.direction.toUpperCase()}, t.id ASC`
    : sortExpressions.join(', ');
  const results = sql.exec(`${classQueryCteSql}SELECT ${selectedColumns}${sortColumns ? ', ' + sortColumns : ''} FROM ${table} t ${join}${where}
    ORDER BY ${orderBy} LIMIT ?`, ...bindings, limit + 1).toArray();
  const selectedRows = results.slice(0, limit);
  const rows = selectedRows.map(row => {
    const item = { ...row };
    if (requestedOrder || galleryOrder || collectionOrder) for (let index = 0; index < sortExpressions.length; index++) delete item['__sort' + index];
    return item;
  });
  const tagMap = tagLists(sql, config.tags, rows.map(row => row.id));
  const last = selectedRows.at(-1);
  return {
    items: rows.map(row => ({ ...addArt(table, row), ...(config.tags ? { tags: (tagMap.get(row.id) ?? []).map(tag => tag.tag) } : {}) })),
    next: results.length > limit ? Buffer.from(JSON.stringify(requestedOrder
      ? [last.__sort0, last.id]
      : galleryOrder || collectionOrder
        ? sortExpressions.map((_, index) => last['__sort' + index])
      : [last.name, last.id])).toString('base64url') : null
  };
}

export function etagFor(item) {
  return '"' + createHash('sha256').update(JSON.stringify(item)).digest('base64url') + '"';
}

export function classOptions(sql, params) {
  const ids = [...new Set(params.getAll('id').filter(Boolean))].map(validateId);
  if (ids.length > 315) throw new HttpError(422, 'A lista de classes excede o limite do catálogo.');
  if (!ids.length) return { items: [] };
  const rows = sql.exec(`SELECT id, name, tier, slot, parent_id AS parentId FROM classes
    WHERE id IN (SELECT value FROM json_each(?))`, JSON.stringify(ids)).toArray();
  const byId = new Map(rows.map(row => [row.id, row]));
  return { items: ids.map(id => byId.get(id)).filter(Boolean) };
}

export function recordFor(sql, table, id) {
  const row = sql.exec(`SELECT * FROM ${table} WHERE id = ?`, id).toArray()[0];
  if (!row) throw new HttpError(404, 'Registro indisponível.');
  const codec = entities.find(entity => entity.table === table);
  const item = decode(row, codec);
  if (table === 'classes') item.slot = row.slot;
  if (codec.tags) item.tags = (tagLists(sql, codec.tags, [id]).get(id) ?? []).map(entry => entry.tag);
  return { item, version: etagFor(item), position: row.position };
}

export function ancestry(sql, id) {
  return sql.exec(`WITH RECURSIVE lineage(id, name, tier, parentId, slot, depth) AS (
    SELECT id, name, tier, parent_id, slot, 0 FROM classes WHERE id = ?
    UNION ALL
    SELECT c.id, c.name, c.tier, c.parent_id, c.slot, l.depth + 1 FROM lineage l
      JOIN classes c ON c.id = l.parentId WHERE l.depth < 3
  ) SELECT id, name, tier, parentId, slot FROM lineage ORDER BY depth DESC`, id).toArray();
}

export function classDetail(sql, item) {
  const lineage = ancestry(sql, item.id);
  const children = sql.exec('SELECT id, name, tier FROM classes WHERE parent_id = ? ORDER BY position, id', item.id).toArray();
  const skillCount = sql.exec('SELECT count(*) AS total FROM skills WHERE class_id = ?', item.id).one().total;
  const cardCount = sql.exec('SELECT count(*) AS total FROM cards WHERE owner_id = ?', item.id).one().total;
  const root = lineage[0]?.id;
  const icon = root ? '/thumbs/' + root + '.webp' : null;
  return { lineage, children, skillCount, cardCount, icon, artwork: catalog.palette.references[root]?.bgPath ?? null };
}

export function overview(sql) {
  const head = sql.exec('SELECT revision, updated_at AS updatedAt FROM workspace WHERE id = 1').toArray()[0];
  if (!head) throw new HttpError(409, 'Importe o Vault para começar.');
  const lineages = sql.exec("SELECT id, name, tier, slot, concept, position FROM classes WHERE tier = 'C1' ORDER BY position, id").toArray();
  const galleryNames = Object.fromEntries(sql.exec("SELECT key, value FROM settings WHERE scope = 'galleryNames'").toArray().map(row => [row.key, JSON.parse(row.value)]));
  const counts = sql.exec(`SELECT
    (SELECT count(*) FROM classes) AS classes,
    (SELECT count(*) FROM cards) AS cards,
    (SELECT count(*) FROM skills) AS skills,
    (SELECT count(*) FROM keywords) AS keywords,
    (SELECT count(*) FROM cards WHERE status = 'CONFIRMADO') AS confirmed`).one();
  return { head, counts, lineages: lineages.map(row => addArt('classes', row)), galleryNames };
}

export function keywordReferences(sql, item) {
  const term = '"' + item.name.replaceAll('"', '""') + '"';
  const references = [];
  for (const [table, columns] of [['classes', ['notes', 'concept', 'name']], ['cards', ['rule_text', 'flavour_text', 'name']]]) {
    const found = sql.exec(`SELECT t.id, t.name FROM ${table}_search s JOIN ${table} t ON t.rowid = s.rowid
      WHERE ${table}_search MATCH ? AND (${columns.map(column => `instr(lower(t.${column}), lower(?)) > 0`).join(' OR ')})
      ORDER BY t.name COLLATE NOCASE, t.id LIMIT 12`, term, ...columns.map(() => '#' + item.name)).toArray();
    references.push(...found.map(row => ({ ...row, table })));
  }
  return references;
}
