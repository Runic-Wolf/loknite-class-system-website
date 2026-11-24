import { normalizeMentionKey } from '../shared/class-mentions.js';

const entity = (table, columns = {}, options = {}) => ({
  table, columns: { id: 'id', ...columns }, key: ['id'], ...options
});

export const entities = [
  entity('classes', { tier: 'tier', parent_id: 'parentId', slot: 'statedPath', name: 'name', concept: 'concept', notes: 'notes', image_path: 'imagePath' }, {
    tags: 'class_tags', derived: { mention_key: record => normalizeMentionKey(record.name) }
  }),
  entity('skills', { class_id: 'classId', card_id: 'cardId', name: 'name', kind: 'kind' }, {
    tags: 'skill_tags', derived: { mention_key: record => normalizeMentionKey(record.name) }
  }),
  entity('cards', {
    category: 'category', slot: 'slot', name: 'name', type: 'type', element: 'element',
    cost: 'cost', rule_text: 'ruleText', flavour_text: 'flavourText', status: 'status',
    workflow_status: 'workflowStatus', art_path: 'artPath', name_font_size: 'nameFontSize',
    type_font_size: 'typeFontSize', element_font_size: 'elementFontSize', rule_font_size: 'ruleFontSize',
    flavour_font_size: 'flavourFontSize', rule_text_offset_y: 'ruleTextOffsetY', flavour_text_offset_y: 'flavourTextOffsetY',
    art_zoom_percent: 'artZoomPercent', art_offset_x_percent: 'artOffsetXPercent', art_offset_y_percent: 'artOffsetYPercent',
    visual_profile: 'visualProfile', gold_mask_path: 'goldMaskPath', prism_mask_path: 'prismMaskPath',
    scene_back_path: 'sceneBackPath', scene_mid_path: 'sceneMidPath', scene_front_path: 'sceneFrontPath',
    scene_smoke_path: 'sceneSmokePath'
  }, {
    tags: 'card_tags',
    defaults: {
      name_font_size: 17, type_font_size: 6, element_font_size: 6, rule_font_size: 10, flavour_font_size: 7,
      rule_text_offset_y: 0, flavour_text_offset_y: 0, art_zoom_percent: 100, art_offset_x_percent: 0, art_offset_y_percent: 0
    },
    derived: {
      skill_id: record => record.source?.skillId ?? null,
      owner_id: record => record.noteOwnerId ?? record.layoutClassId ?? null,
      mention_key: record => normalizeMentionKey(record.name)
    }
  }),
  entity('keywords', { name: 'name', effect: 'effect' }),
  entity('links'),
  entity('presets')
];

export const settings = { table: 'settings', key: ['scope', 'key'], fields: ['scope', 'key', 'value'] };

export function codecs() {
  const result = [];
  for (const entity of entities) {
    result.push({
      ...entity,
      fields: [...Object.keys(entity.columns), ...Object.keys(entity.derived ?? {}), 'position', 'details'],
      order: 'position, id'
    });
    if (entity.tags) result.push({
      table: entity.tags, key: ['entity_id', 'tag'], fields: ['entity_id', 'tag', 'position'],
      order: 'entity_id, position'
    });
  }
  result.push(settings);
  return result;
}

export function encode(record, index, codec) {
  const properties = new Set(Object.values(codec.columns));
  if (codec.tags) properties.add('tags');
  const row = { position: index };
  const nulls = [];
  for (const [column, property] of Object.entries(codec.columns)) {
    row[column] = record[property] ?? codec.defaults?.[column] ?? null;
    if (record[property] === null) nulls.push(property);
  }
  const extra = Object.fromEntries(Object.entries(record).filter(([key]) => !properties.has(key)));
  row.details = JSON.stringify([extra, nulls]);
  for (const [column, value] of Object.entries(codec.derived ?? {})) row[column] = value(record);
  return row;
}

export function decode(row, codec) {
  const [extra, nulls] = JSON.parse(row.details);
  for (const [column, property] of Object.entries(codec.columns)) {
    if (row[column] !== null || nulls.includes(property)) {
      Object.defineProperty(extra, property, { value: row[column], enumerable: true, writable: true, configurable: true });
    }
  }
  return extra;
}

const envelope = ['format', 'schemaVersion', 'vaultId', 'revision', 'transactionId', 'updatedAt'];
const collections = ['classes', 'skills', 'links', 'presets', 'customGroups', 'galleryNames', 'preferences'];

export function toRows(pair) {
  if (!pair) return new Map();
  const { vault, cardvault } = pair;
  const rows = new Map();
  for (const codec of entities) {
    const records = (vault[codec.table] ?? cardvault[codec.table] ?? []);
    rows.set(codec.table, records.map((record, index) => encode(record, index, codec)));
    if (codec.tags) rows.set(codec.tags, records.flatMap(record => (record.tags ?? []).map((tag, position) => ({
      entity_id: record.id, tag, position
    }))));
  }
  const without = (record, keys) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
  const groups = {
    preferences: vault.preferences,
    customGroups: vault.customGroups,
    galleryNames: vault.galleryNames,
    vault: without(vault, [...envelope, ...collections]),
    cardvault: without(cardvault, [...envelope, 'cards', 'keywords'])
  };
  rows.set(settings.table, Object.entries(groups).flatMap(([scope, values]) =>
    Object.entries(values).map(([key, value]) => ({ scope, key, value: JSON.stringify(value) }))));
  return rows;
}

export function fromRows(head, rows) {
  const metadata = { schemaVersion: 2, vaultId: head.vault_id, revision: head.revision, transactionId: head.transaction_id, updatedAt: head.updated_at };
  const groups = new Map(['preferences', 'customGroups', 'galleryNames', 'vault', 'cardvault'].map(key => [key, new Map()]));
  for (const row of rows.get(settings.table)) groups.get(row.scope).set(row.key, JSON.parse(row.value));
  const group = key => Object.fromEntries(groups.get(key));
  const vault = { ...group('vault'), ...metadata, format: 'loknite-vault', preferences: group('preferences'), customGroups: group('customGroups'), galleryNames: group('galleryNames') };
  const cardvault = { ...group('cardvault'), ...metadata, format: 'loknite-cardvault' };
  for (const codec of entities) {
    const tags = Map.groupBy(codec.tags ? rows.get(codec.tags) : [], row => row.entity_id);
    const records = rows.get(codec.table).map(row => {
      const record = decode(row, codec);
      if (codec.tags) record.tags = (tags.get(record.id) ?? []).map(item => item.tag);
      return record;
    });
    const target = ['cards', 'keywords'].includes(codec.table) ? cardvault : vault;
    target[codec.table] = records;
  }
  return { vault, cardvault };
}
