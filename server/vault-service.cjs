'use strict';

const crypto = require('node:crypto');

const VAULT_FORMAT = 'loknite-vault';
const CARDVAULT_FORMAT = 'loknite-cardvault';
const SCHEMA_VERSION = 2;
const CATEGORIES = new Set(['class', 'enemy', 'neutral', 'equipment', 'species', 'status']);
const TYPES = new Set(['Attack', 'Skill', 'Power', 'Other', 'Class Mechanic']);
const ELEMENTS = new Set(['Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy']);
const WORKFLOW_STATUSES = new Set(['draft', 'review', 'completed', 'audited']);
const TAG_CATALOG = new Set([
  'C1', 'C2', 'C3', 'SPEC', 'DPS', 'TANK', 'HEAL', 'CTRL', 'BUFF', 'DEBUFF', 'BURST', 'DOT',
  'STR', 'DEX', 'AGI', 'VIT', 'INT', 'WIL', 'AUS', 'WIT', 'CHA', 'LIGHT', 'MEDIUM', 'HEAVY', 'SHIELD',
  '1H Sword', '2H Sword', '1H Axe', '2H Axe', '1H Mace', '2H Mace', '1H Spear', '2H Spear', '1H Katana', '2H Katana',
  'Shortbow', 'Longbow', 'Handgun', 'Crossbow', 'Pistol', 'Blunderbuss', 'Cannon', 'Musket',
  '1H Wand', '2H Rod', '2H Staff', 'Knuckles', 'Claws', 'Dagger', 'Katar',
  'Neutral', 'Fire', 'Earth', 'Water', 'Wind', 'Nature', 'Spiritual', 'Arcane', 'Profane', 'Holy'
]);
const GAMEPLAY_FIELDS = Object.freeze([
  'id', 'category', 'slot', 'name', 'type', 'element',
  'cost', 'ruleText', 'flavourText', 'artPath', 'tags'
]);
const LEGACY_RARITY_GAMEPLAY_FIELDS = Object.freeze([
  'id', 'category', 'slot', 'name', 'rarity', 'type', 'element', 'cost', 'ruleText', 'flavourText', 'artPath', 'tags'
]);
const LEGACY_GAMEPLAY_FIELDS = Object.freeze([...LEGACY_RARITY_GAMEPLAY_FIELDS.slice(0, 6), 'subtype', ...LEGACY_RARITY_GAMEPLAY_FIELDS.slice(6)]);
const CARD_METADATA = new Set([
  'id', 'category', 'slot', 'status', 'source', 'createdAt', 'updatedAt',
  'confirmedAt', 'confirmedRevision', 'confirmedGameplayHash',
  'sourceRevisionAtSync', 'sourceSnapshot', 'divergence', 'pendingDraft', 'subtype'
]);
const MEDIA_LIMIT_DEFAULT = 25 * 1024 * 1024;
const TX_RE = /^tx-[a-f0-9-]{16,64}$/i;
const ID_RE = /^[A-Za-z0-9_.:-]{1,160}$/;

class VaultError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) { throw new VaultError(code, message, details); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function clone(value) {
  if (value === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(value)); }
  catch (error) { fail('INVALID_INPUT', `Input precisa ser JSON simples: ${error.message}`); }
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isObject(value)) return value;
  const out = Object.create(null);
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}
function stableJson(value) { return JSON.stringify(canonical(value)); }
function isoNow() { return new Date().toISOString(); }
function makeId(prefix, value) { return `${prefix}-${sha256(Buffer.from(String(value), 'utf8')).slice(0, 32)}`; }
function safeId(value, label) {
  if (typeof value !== 'string' || !ID_RE.test(value)) fail('INVALID_INPUT', `${label} inválido.`);
  return value;
}
function sameJson(a, b) { return stableJson(a) === stableJson(b); }
function dedupeStrings(items) {
  if (!Array.isArray(items)) return [];
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (typeof item !== 'string') fail('INVALID_INPUT', 'Tags devem ser textos.');
    if (!seen.has(item)) { seen.add(item); result.push(item); }
  }
  return result;
}
function customTagSet(customGroups) {
  const result = new Set();
  for (const groupName of ['traits', 'custom']) {
    const group = customGroups?.[groupName];
    const items = Array.isArray(group) ? group : isObject(group) ? Object.values(group) : [];
    for (const item of items) {
      if (typeof item === 'string') result.add(item);
      else if (Array.isArray(item) && typeof item[0] === 'string') result.add(item[0]);
      else if (isObject(item)) for (const key of ['id', 'tag', 'value', 'name']) if (typeof item[key] === 'string') result.add(item[key]);
    }
  }
  return result;
}
function validateTagList(tags, customTags, label) {
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) fail('INVALID_TAG', `Tags inválidas em ${label}.`);
  if (new Set(tags).size !== tags.length) fail('INVALID_TAG', `Tags duplicadas em ${label}.`);
  for (const tag of tags) if (!TAG_CATALOG.has(tag) && !customTags.has(tag)) fail('INVALID_TAG', `Tag não definida no catálogo ou customGroups: ${tag} (${label}).`);
}
function mediaPath(value, label = 'mediaPath') {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.includes('\\') || value.includes(':') || value.includes('\0') || value.startsWith('/')) {
    fail('INVALID_MEDIA_PATH', `${label} deve ser um caminho POSIX relativo a media_vault/.`);
  }
  const parts = value.split('/');
  const reservedDevice = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
  if (parts[0] !== 'media_vault' || parts.some(part =>
    !part || part === '.' || part === '..' || /[. ]$/.test(part) || /[<>"|?*\x00-\x1f]/.test(part) || reservedDevice.test(part)
  )) {
    fail('INVALID_MEDIA_PATH', `${label} deve ficar dentro de media_vault/.`);
  }
  return parts.join('/');
}
function unityMediaEntries(vault) {
  const entries = vault.preferences?.unityMedia;
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) fail('INVALID_UNITY_MEDIA', 'preferences.unityMedia precisa ser uma lista.');
  const seen = new Set();
  return entries.map((item, index) => {
    if (!isObject(item)) fail('INVALID_UNITY_MEDIA', `unityMedia[${index}] inválido.`);
    const sourcePath = mediaPath(item.sourcePath, `unityMedia[${index}].sourcePath`);
    const pngPath = mediaPath(item.pngPath, `unityMedia[${index}].pngPath`);
    if (!sourcePath || !pngPath || !sourcePath.toLowerCase().endsWith('.webp') || !pngPath.toLowerCase().endsWith('.png') || sourcePath === pngPath) {
      fail('INVALID_UNITY_MEDIA', `unityMedia[${index}] deve vincular WebP original a PNG derivado.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(item.sourceSha256 || '') || !/^[a-f0-9]{64}$/i.test(item.pngSha256 || '')) fail('INVALID_UNITY_MEDIA', `Hashes inválidos em unityMedia[${index}].`);
    if (seen.has(sourcePath)) fail('INVALID_UNITY_MEDIA', `sourcePath duplicado em unityMedia: ${sourcePath}`);
    seen.add(sourcePath);
    return item;
  });
}
function sniffMedia(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  fail('INVALID_MEDIA', 'Magic bytes não correspondem a PNG, JPEG ou WebP.');
}
function collectReferencedMedia(vault, cardvault) {
  const paths = new Set();
  for (const cls of vault.classes || []) if (cls.imagePath) paths.add(mediaPath(cls.imagePath, `classes[${cls.id}].imagePath`));
  for (const card of cardvault.cards || []) if (card.artPath) paths.add(mediaPath(card.artPath, `cards[${card.id}].artPath`));
  const palette = vault.preferences?.officialC1Palette;
  if (palette !== undefined) {
    if (!isObject(palette)) fail('INVALID_PALETTE', 'preferences.officialC1Palette precisa ser objeto.');
    for (let i = 0; i < 15; i++) {
      const id = `base_${i}`;
      const entry = palette[id];
      if (!isObject(entry)) fail('INVALID_PALETTE', `Asset C1 ausente em officialC1Palette.${id}.`);
      for (const field of ['bgPath', 'iconPath']) {
        if (typeof entry[field] !== 'string' || !entry[field].trim()) fail('INVALID_PALETTE', `officialC1Palette.${id}.${field} precisa ser path relativo.`);
        paths.add(mediaPath(entry[field], `officialC1Palette.${id}.${field}`));
      }
    }
  }
  for (const item of unityMediaEntries(vault)) {
    paths.add(item.sourcePath);
    paths.add(item.pngPath);
  }
  return [...paths].sort();
}
function validateUnityMediaMetadata(vault, metadataByPath) {
  for (const item of unityMediaEntries(vault)) {
    const source = metadataByPath.get(item.sourcePath);
    const png = metadataByPath.get(item.pngPath);
    if (!source || !png) fail('UNITY_MEDIA_MISSING', `Derivada Unity incompleta para ${item.sourcePath}.`);
    if (source.sha256 !== item.sourceSha256 || source.mime !== 'image/webp') fail('UNITY_MEDIA_CHECKSUM', `WebP original inválido para ${item.sourcePath}.`);
    if (png.sha256 !== item.pngSha256 || png.mime !== 'image/png') fail('UNITY_MEDIA_CHECKSUM', `PNG derivado inválido para ${item.pngPath}.`);
  }
}
function mergeUnityMediaEntries(...lists) {
  const bySource = new Map();
  for (const list of lists) {
    if (list === undefined) continue;
    for (const item of unityMediaEntries({ preferences: { unityMedia: list } })) {
      const previous = bySource.get(item.sourcePath);
      if (previous && (previous.sourceSha256 !== item.sourceSha256 || previous.pngPath !== item.pngPath || previous.pngSha256 !== item.pngSha256)) {
        fail('UNITY_MEDIA_CONFLICT', `Derivadas divergentes para ${item.sourcePath}.`);
      }
      bySource.set(item.sourcePath, { ...(previous || {}), ...clone(item) });
    }
  }
  return [...bySource.values()].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}
function cardGameplay(card, fields = GAMEPLAY_FIELDS) {
  const result = {};
  for (const field of fields) {
    let value = card[field];
    if (field === 'tags') value = dedupeStrings(value).slice().sort();
    if (field === 'artPath') value = value == null ? null : value;
    if (value === undefined) value = null;
    result[field] = value;
  }
  return result;
}
function gameplayHash(card) { return sha256(Buffer.from(stableJson(cardGameplay(card)), 'utf8')); }
function legacyGameplayHash(card) { return sha256(Buffer.from(stableJson(cardGameplay(card, LEGACY_GAMEPLAY_FIELDS)), 'utf8')); }
function legacyRarityGameplayHash(card) { return sha256(Buffer.from(stableJson(cardGameplay(card, LEGACY_RARITY_GAMEPLAY_FIELDS)), 'utf8')); }
function normalizeKeywordName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
}
function keywordNameKey(value) { return normalizeKeywordName(value).toLocaleLowerCase('pt-BR'); }
function normalizeKeywordRecords(records, previous = []) {
  if (!Array.isArray(records)) fail('INVALID_KEYWORD', 'keywords precisa ser uma lista.');
  const previousByName = new Map((Array.isArray(previous) ? previous : []).filter(isObject).map(item => [keywordNameKey(item.name), item]));
  const ids = new Set();
  const names = new Set();
  return records.map((entry, index) => {
    if (!isObject(entry)) fail('INVALID_KEYWORD', `Keyword inválida na posição ${index}.`);
    const name = normalizeKeywordName(entry.name);
    const key = keywordNameKey(name);
    const effect = entry.effect === undefined ? '' : entry.effect;
    if (!name || name.length > 120 || typeof effect !== 'string' || effect.length > 12000) fail('INVALID_KEYWORD', `Nome/efeito inválido na keyword da posição ${index}.`);
    if (names.has(key)) fail('INVALID_KEYWORD', `Nome de keyword duplicado: ${name}.`);
    const old = previousByName.get(key);
    const id = entry.id === undefined ? (old?.id || `keyword-${crypto.randomUUID()}`) : safeId(entry.id, 'keyword.id');
    if (ids.has(id)) fail('INVALID_KEYWORD', `ID de keyword duplicado: ${id}.`);
    ids.add(id);
    names.add(key);
    return { id, name, effect };
  });
}
function syncElementTag(body, existing) {
  if (existing && body.element === existing.element && sameJson(dedupeStrings(body.tags), dedupeStrings(existing.tags))) return;
  const tags = dedupeStrings(body.tags).filter(tag => !ELEMENTS.has(tag));
  if (ELEMENTS.has(body.element)) tags.push(body.element);
  body.tags = dedupeStrings(tags);
}
function sourceSnapshot(skill, classById) {
  const owner = classById.get(skill.classId);
  const root = owner ? rootClass(owner, classById) : null;
  return {
    name: skill.name,
    tags: dedupeStrings(skill.tags),
    classId: skill.classId,
    rootClassId: root?.id ?? null
  };
}
function rootClass(entry, classById) {
  let current = entry;
  const seen = new Set();
  while (current && current.tier !== 'C1') {
    if (seen.has(current.id)) fail('INVALID_TOPOLOGY', `Ciclo na árvore de classes em ${current.id}.`);
    seen.add(current.id);
    current = classById.get(current.parentId);
  }
  return current || null;
}
function freeNoteDraftContext(noteOwnerId, noteTier, layoutClassId, category, slot, classById) {
  const owner = classById.get(noteOwnerId);
  if (!owner || owner.tier !== 'C3' || !['C1', 'C2', 'C3'].includes(noteTier)) return null;
  const root = rootClass(owner, classById);
  const associated = noteTier === 'C1' ? root : noteTier === 'C2' ? classById.get(owner.parentId) : owner;
  if (!root || !associated || associated.tier !== noteTier || associated.id !== layoutClassId || category !== 'class' || slot !== Number(root.statedPath.slice(3))) return null;
  return { owner, associated, root };
}
function sourceDiff(before, current) {
  const fields = [];
  for (const field of ['name', 'tags', 'classId', 'rootClassId']) {
    if (!sameJson(before?.[field] ?? null, current?.[field] ?? null)) fields.push(field);
  }
  return { hasPendingSourceChanges: fields.length > 0, fields };
}
function cardBody(card) {
  const body = {};
  for (const [key, value] of Object.entries(card)) if (!CARD_METADATA.has(key) && key !== 'rarity') body[key] = clone(value);
  body.name = card.name || '';
  body.type = typeof card.type === 'string' ? card.type : 'Attack';
  body.element = typeof card.element === 'string' ? card.element : 'Neutral';
  body.cost = typeof card.cost === 'string' ? card.cost : (card.cost == null ? '1' : String(card.cost));
  body.ruleText = card.ruleText || '';
  body.flavourText = card.flavourText || '';
  body.tags = dedupeStrings(card.tags);
  body.artPath = card.artPath ?? null;
  body.art = body.artPath || '';
  return body;
}
function parseDataUri(value) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value);
  if (!match) fail('UNSUPPORTED_MEDIA', 'Apenas PNG, JPEG e WebP em data URI podem ser migrados.');
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const compact = match[2].replace(/[\r\n]/g, '');
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.toString('base64') !== compact) fail('INVALID_MEDIA', 'Data URI contém Base64 inválido.');
  return { mime, bytes };
}

function createVaultService({ repository, media }) {


  async function importMediaInternal(bytes) {
    return media.put(Buffer.from(bytes));
  }

  async function migrateMedia(value) {
    if (typeof value !== 'string' || !value) return null;
    if (value.startsWith('data:')) {
      const parsed = parseDataUri(value);
      return (await importMediaInternal(parsed.bytes)).path;
    }
    return mediaPath(value);
  }

  async function resolveMedia(relative) {
    const safe = mediaPath(relative);
    if (safe && !(await media.metadata([safe])).has(safe)) fail('MISSING_MEDIA', 'Mídia referenciada não existe: ' + safe);
    return safe;
  }

  function assertNoDataUri(value, pathLabel = '$') {
    if (typeof value === 'string' && /^data:image\//i.test(value)) fail('BASE64_MEDIA', `Mídia Base64 ainda presente em ${pathLabel}.`);
    if (Array.isArray(value)) value.forEach((item, index) => assertNoDataUri(item, `${pathLabel}[${index}]`));
    else if (isObject(value)) for (const [key, item] of Object.entries(value)) assertNoDataUri(item, `${pathLabel}.${key}`);
  }

  async function validateMediaReferences(vault, cardvault) {
    const paths = [...collectReferencedMedia(vault, cardvault)];
    const metadata = await media.metadata(paths);
    for (const relative of paths) if (!metadata.has(relative)) fail('MISSING_MEDIA', 'Mídia referenciada não existe: ' + relative);
    validateUnityMediaMetadata(vault, metadata);
  }

  function validateTopology(classes) {
    if (!Array.isArray(classes) || classes.length !== 315) fail('INVALID_TOPOLOGY', 'Classes devem preservar exatamente 315 slots.');
    const byId = new Map();
    for (const cls of classes) {
      if (!isObject(cls)) fail('INVALID_TOPOLOGY', 'Registro de classe inválido.');
      safeId(cls.id, 'class.id');
      if (typeof cls.name !== 'string' || !cls.name.trim()) fail('INVALID_CLASS', `Nome de classe inválido em ${cls.id}.`);
      for (const field of ['concept', 'notes']) if (Object.hasOwn(cls, field) && typeof cls[field] !== 'string') fail('INVALID_CLASS', `${field} inválido em ${cls.id}.`);
      if (Object.hasOwn(cls, 'official') && typeof cls.official !== 'boolean') fail('INVALID_CLASS', `official inválido em ${cls.id}.`);
      if (cls.tags !== undefined && !Array.isArray(cls.tags)) fail('INVALID_CLASS', `tags inválidas em ${cls.id}.`);
      if (byId.has(cls.id)) fail('INVALID_TOPOLOGY', `ID de classe duplicado: ${cls.id}`);
      byId.set(cls.id, cls);
    }
    const tiers = { C1: 0, C2: 0, C3: 0, SPEC: 0 };
    const paths = new Set();
    const children = new Map();
    for (const cls of classes) {
      if (!Object.hasOwn(tiers, cls.tier)) fail('INVALID_TOPOLOGY', `Tier inválido em ${cls.id}.`);
      tiers[cls.tier]++;
      if (typeof cls.statedPath !== 'string' || !cls.statedPath || paths.has(cls.statedPath)) fail('INVALID_TOPOLOGY', `statedPath ausente ou duplicado em ${cls.id}.`);
      paths.add(cls.statedPath);
      if (cls.tier === 'C1') {
        if (cls.parentId != null && cls.parentId !== '') fail('INVALID_TOPOLOGY', `C1 ${cls.id} não pode ter pai.`);
        if (!/^C1_(?:[0-9]|1[0-4])$/.test(cls.statedPath)) fail('INVALID_TOPOLOGY', `Caminho C1 inválido: ${cls.statedPath}`);
      } else {
        const parent = byId.get(cls.parentId);
        const previousTier = cls.tier === 'C2' ? 'C1' : cls.tier === 'C3' ? 'C2' : 'C3';
        if (!parent || parent.tier !== previousTier) fail('INVALID_TOPOLOGY', `Pai/tier inválido em ${cls.id}.`);
        if (cls.statedPath.slice(0, parent.statedPath.length + 1) !== `${parent.statedPath}/`) fail('INVALID_TOPOLOGY', `Caminho de ${cls.id} não corresponde ao pai.`);
        const suffix = cls.statedPath.slice(parent.statedPath.length + 1);
        const expectedPrefix = cls.tier === 'SPEC' ? 'SPEC_' : `${cls.tier}_`;
        const maxIndex = cls.tier === 'C2' ? 1 : cls.tier === 'C3' ? 2 : 1;
        if (!suffix.startsWith(expectedPrefix) || !/^[0-9]+$/.test(suffix.slice(expectedPrefix.length)) || Number(suffix.slice(expectedPrefix.length)) > maxIndex) {
          fail('INVALID_TOPOLOGY', `Slot de caminho inválido em ${cls.id}.`);
        }
        const group = children.get(parent.id) || [];
        group.push(cls);
        children.set(parent.id, group);
      }
    }
    if (tiers.C1 !== 15 || tiers.C2 !== 30 || tiers.C3 !== 90 || tiers.SPEC !== 180) fail('INVALID_TOPOLOGY', 'Contagem de tiers deve ser [15, 30, 90, 180].');
    for (const cls of classes) {
      if (cls.tier === 'C1' && children.get(cls.id)?.length !== 2) fail('INVALID_TOPOLOGY', `C1 ${cls.id} deve ter 2 C2.`);
      if (cls.tier === 'C2' && children.get(cls.id)?.length !== 3) fail('INVALID_TOPOLOGY', `C2 ${cls.id} deve ter 3 C3.`);
      if (cls.tier === 'C3' && children.get(cls.id)?.length !== 2) fail('INVALID_TOPOLOGY', `C3 ${cls.id} deve ter 2 Specs.`);
      const expected = cls.tier === 'C1' ? 2 : cls.tier === 'C2' ? 3 : cls.tier === 'C3' ? 2 : 0;
      const group = children.get(cls.id) || [];
      const indices = group.map(child => Number(child.statedPath.slice(child.statedPath.lastIndexOf('_') + 1))).sort((a, b) => a - b);
      if (indices.length && (indices.some((index, i) => index !== i) || indices.length !== expected)) fail('INVALID_TOPOLOGY', `Índices de filhos inválidos em ${cls.id}.`);
    }
    const rootIndices = classes.filter(cls => cls.tier === 'C1').map(cls => Number(cls.statedPath.slice(3))).sort((a, b) => a - b);
    if (rootIndices.some((index, i) => index !== i)) fail('INVALID_TOPOLOGY', 'Slots C1 devem manter IDs de caminho C1_0..C1_14.');
    return byId;
  }

  function validateStableTopology(previousClasses, nextClasses) {
    const previous = new Map(previousClasses.map(cls => [cls.id, cls]));
    const next = new Map(nextClasses.map(cls => [cls.id, cls]));
    if (previous.size !== next.size || [...previous.keys()].some(id => !next.has(id))) {
      fail('SLOT_IDENTITY_CHANGED', 'IDs dos 315 slots são imutáveis após a inicialização.');
    }
    for (const [id, prior] of previous) {
      const nextClass = next.get(id);
      for (const field of ['tier', 'parentId', 'statedPath']) {
        if ((prior[field] ?? null) !== (nextClass[field] ?? null)) fail('SLOT_IDENTITY_CHANGED', `Campo estrutural ${field} mudou no slot ${id}.`);
      }
    }
  }

  function validatePair(vault, cardvault) {
    if (!isObject(vault) || vault.format !== VAULT_FORMAT || ![1, SCHEMA_VERSION].includes(vault.schemaVersion)) fail('INVALID_VAULT', 'Formato ou versão de vault.json inválidos.');
    if (!isObject(cardvault) || cardvault.format !== CARDVAULT_FORMAT || cardvault.schemaVersion !== vault.schemaVersion) fail('INVALID_CARDVAULT', 'Formato ou versão de cardvault.json inválidos.');
    if (typeof vault.vaultId !== 'string' || !vault.vaultId || vault.vaultId !== cardvault.vaultId) fail('PAIR_MISMATCH', 'vaultId divergente entre os JSONs.');
    if (typeof vault.transactionId !== 'string' || !TX_RE.test(vault.transactionId) || vault.transactionId !== cardvault.transactionId) fail('PAIR_MISMATCH', 'transactionId divergente ou inválida entre os JSONs.');
    if (!Number.isSafeInteger(vault.revision) || vault.revision < 1 || vault.revision !== cardvault.revision) fail('PAIR_MISMATCH', 'revision divergente ou inválida entre os JSONs.');
    if (typeof vault.updatedAt !== 'string' || vault.updatedAt !== cardvault.updatedAt || Number.isNaN(Date.parse(vault.updatedAt))) fail('PAIR_MISMATCH', 'updatedAt divergente ou inválido entre os JSONs.');
    if (!Array.isArray(vault.classes) || !Array.isArray(vault.skills) || !Array.isArray(cardvault.cards)) fail('INVALID_VAULT', 'Classes, skills e cards precisam ser listas.');
    if (!isObject(vault.customGroups)) fail('INVALID_VAULT', 'customGroups inválido.');
    const keywords = cardvault.keywords === undefined ? [] : cardvault.keywords;
    if (!Array.isArray(keywords)) fail('INVALID_CARDVAULT', 'keywords precisa ser uma lista.');
    const keywordIds = new Set();
    const keywordNames = new Set();
    for (const keyword of keywords) {
      if (!isObject(keyword)) fail('INVALID_KEYWORD', 'Keyword inválida.');
      safeId(keyword.id, 'keyword.id');
      const name = normalizeKeywordName(keyword.name);
      if (!name || name.length > 120 || typeof keyword.effect !== 'string' || keyword.effect.length > 12000) fail('INVALID_KEYWORD', `Campos inválidos na keyword ${keyword.id}.`);
      const key = keywordNameKey(name);
      if (keywordIds.has(keyword.id) || keywordNames.has(key)) fail('INVALID_KEYWORD', `ID ou nome de keyword duplicado: ${name}.`);
      keywordIds.add(keyword.id);
      keywordNames.add(key);
    }
    const customTags = customTagSet(vault.customGroups);
    const classById = validateTopology(vault.classes);
    const skillById = new Map();
    for (const skill of vault.skills) {
      if (!isObject(skill)) fail('INVALID_SKILL', 'Skill inválida.');
      safeId(skill.id, 'skill.id');
      safeId(skill.classId, 'skill.classId');
      if (typeof skill.name !== 'string' || !skill.name.trim()) fail('INVALID_SKILL', `Nome inválido em ${skill.id}.`);
      if (!['Passive', 'Active', 'Signature', 'Ultimate'].includes(skill.kind)) fail('INVALID_SKILL', `Kind inválido em ${skill.id}.`);
      for (const field of ['lcsNotes', 'mobileNotes']) if (Object.hasOwn(skill, field) && typeof skill[field] !== 'string') fail('INVALID_SKILL', `${field} inválido em ${skill.id}.`);
      if (skillById.has(skill.id)) fail('INVALID_SKILL', `ID de skill duplicado: ${skill.id}`);
      if (!classById.has(skill.classId)) fail('INVALID_SKILL', `Classe da skill não existe: ${skill.classId}`);
      if (!safeId(skill.cardId, 'skill.cardId')) fail('INVALID_SKILL', `cardId ausente em ${skill.id}.`);
      skillById.set(skill.id, skill);
      validateTagList(skill.tags, customTags, `skill ${skill.id}`);
    }
    for (const cls of vault.classes) validateTagList(cls.tags || [], customTags, `classe ${cls.id}`);
    const cardById = new Map();
    const cardBySkill = new Map();
    const classMechanicClasses = new Set();
    for (const card of cardvault.cards) {
      if (!isObject(card)) fail('INVALID_CARD', 'Carta inválida.');
      safeId(card.id, 'card.id');
      if (cardById.has(card.id)) fail('INVALID_CARD', `ID de carta duplicado: ${card.id}`);
      if (!CATEGORIES.has(card.category) || !Number.isInteger(card.slot) || card.slot < 0 || card.slot > 14) fail('INVALID_CARD', `Categoria/slot inválido em ${card.id}.`);
      if (!['RASCUNHO', 'CONFIRMADO'].includes(card.status)) fail('INVALID_CARD', `Status editorial inválido em ${card.id}.`);
      if (card.workflowStatus === undefined) card.workflowStatus = 'draft';
      if (!WORKFLOW_STATUSES.has(card.workflowStatus)) fail('INVALID_CARD', `workflowStatus inválido em ${card.id}.`);
      if (!isObject(card.source) || !['skill', 'independent'].includes(card.source.kind)) fail('INVALID_CARD', `source inválido em ${card.id}.`);
      if (typeof card.name !== 'string' || typeof card.type !== 'string' || typeof card.element !== 'string' || typeof card.cost !== 'string' || typeof card.ruleText !== 'string' || typeof card.flavourText !== 'string') fail('INVALID_CARD', `Campos editoriais inválidos em ${card.id}.`);
      if (vault.schemaVersion === SCHEMA_VERSION && Object.hasOwn(card, 'subtype')) fail('INVALID_CARD', `Campo removido ainda presente em ${card.id}.`);
      const hasNoteMetadata = card.noteOwnerId != null || card.noteTier != null;
      const noteContext = hasNoteMetadata
        ? freeNoteDraftContext(card.noteOwnerId, card.noteTier, card.layoutClassId, card.category, card.slot, classById)
        : null;
      if (hasNoteMetadata && (card.source.kind !== 'independent' || !noteContext)) fail('INVALID_CARD', 'Associação Free Note inválida.');
      validateCardBody(card, card.id, hasNoteMetadata && card.status === 'RASCUNHO');
      validateTagList(card.tags, customTags, `carta ${card.id}`);
      if (card.type === 'Class Mechanic') {
        const mechanicClass = classById.get(card.classMechanicForClassId);
        const root = mechanicClass && rootClass(mechanicClass, classById);
        if (card.source.kind !== 'independent' || card.category !== 'class' || !['C1', 'C2', 'C3'].includes(mechanicClass?.tier) || card.layoutClassId !== mechanicClass.id || !root || card.slot !== Number(root.statedPath.slice(3))) fail('INVALID_CARD', `Class Mechanic sem associação válida em ${card.id}.`);
        if (classMechanicClasses.has(mechanicClass.id)) fail('INVALID_CARD', `Class Mechanic duplicada para ${mechanicClass.id}.`);
        classMechanicClasses.add(mechanicClass.id);
      }
      if (typeof card.createdAt !== 'string' || Number.isNaN(Date.parse(card.createdAt)) || typeof card.updatedAt !== 'string' || Number.isNaN(Date.parse(card.updatedAt))) fail('INVALID_CARD', `Timestamps inválidos em ${card.id}.`);
      if (!Number.isSafeInteger(card.sourceRevisionAtSync) || card.sourceRevisionAtSync < 1) fail('INVALID_CARD', `sourceRevisionAtSync inválido em ${card.id}.`);
      if (!isObject(card.divergence) || typeof card.divergence.hasPendingSourceChanges !== 'boolean' || !Array.isArray(card.divergence.fields) || card.divergence.fields.some(field => typeof field !== 'string')) fail('INVALID_CARD', `divergence inválida em ${card.id}.`);
      if (card.artPath != null) mediaPath(card.artPath, `cards[${card.id}].artPath`);
      if (card.source.kind === 'skill') {
        safeId(card.source.skillId, 'card.source.skillId');
        const skill = skillById.get(card.source.skillId);
        if (!skill) fail('INVALID_CARD', `Skill de origem não existe em ${card.id}.`);
        if (skill.cardId !== card.id) fail('INVALID_CARD', `cardId da skill diverge em ${card.id}.`);
        if (cardBySkill.has(card.source.skillId)) fail('INVALID_CARD', `Mais de uma carta para a skill ${card.source.skillId}.`);
        if (card.category !== 'class') fail('INVALID_CARD', `Carta vinculada à skill deve ser categoria class (${card.id}).`);
        if (card.source.classId !== skill.classId) fail('INVALID_CARD', `Classe da origem diverge em ${card.id}.`);
        const owner = classById.get(skill.classId);
        const root = rootClass(owner, classById);
        if (card.source.rootClassId !== root.id) fail('INVALID_CARD', `Raiz da origem diverge em ${card.id}.`);
        if (card.status === 'RASCUNHO' && card.slot !== Number(root.statedPath.slice(3))) fail('INVALID_CARD', `Slot da carta draft diverge em ${card.id}.`);
        const sourceNow = sourceSnapshot(skill, classById);
        if (!isObject(card.sourceSnapshot)) fail('INVALID_CARD', `sourceSnapshot ausente em ${card.id}.`);
        const expectedDivergence = sourceDiff(card.sourceSnapshot, sourceNow);
        if (card.status === 'RASCUNHO' && expectedDivergence.hasPendingSourceChanges) fail('INVALID_CARD', `Carta draft ainda possui divergência de origem em ${card.id}.`);
        if (!sameJson(card.divergence, expectedDivergence)) fail('INVALID_CARD', `Divergence não corresponde à origem em ${card.id}.`);
        cardBySkill.set(card.source.skillId, card);
      }
      if (card.status === 'CONFIRMADO') {
        if (!Number.isSafeInteger(card.confirmedRevision) || card.confirmedRevision < 1 || typeof card.confirmedAt !== 'string' || !/^[a-f0-9]{64}$/i.test(card.confirmedGameplayHash || '')) fail('INVALID_CARD', `Snapshot de confirmação ausente em ${card.id}.`);
        if (Number.isNaN(Date.parse(card.confirmedAt))) fail('INVALID_CARD', `confirmedAt inválido em ${card.id}.`);
        const currentHash = gameplayHash(card);
        const legacyHash = vault.schemaVersion === 1 ? legacyGameplayHash(card) : legacyRarityGameplayHash(card);
        if (currentHash !== card.confirmedGameplayHash && legacyHash !== card.confirmedGameplayHash) fail('CONFIRMED_GAMEPLAY_MISMATCH', `Hash aprovado diverge dos campos de gameplay em ${card.id}.`);
      } else if (card.confirmedAt != null || card.confirmedRevision != null || card.confirmedGameplayHash != null) {
        fail('INVALID_CARD', `Carta draft não pode manter confirmação em ${card.id}.`);
      }
      cardById.set(card.id, card);
    }
    if (cardBySkill.size !== skillById.size) fail('INVALID_CARD', 'Cada skill precisa de uma carta vinculada.');
    for (const skill of vault.skills) if (!cardBySkill.has(skill.id)) fail('INVALID_CARD', `Carta vinculada ausente para skill ${skill.id}.`);
    if (!Array.isArray(vault.links)) fail('INVALID_VAULT', 'links precisa ser lista.');
    const ids = new Set([...classById.keys(), ...skillById.keys(), ...cardById.keys()]);
    for (const link of vault.links) {
      if (!isObject(link)) fail('INVALID_LINK', 'Link inválido.');
      if (typeof link.from === 'string' && typeof link.to === 'string' && !link.archived && !link.disabled && (!ids.has(link.from) || !ids.has(link.to))) fail('INVALID_LINK', `Link órfão: ${link.from} → ${link.to}.`);
    }
    if (!Array.isArray(vault.presets) || !isObject(vault.customGroups) || !isObject(vault.galleryNames) || !isObject(vault.preferences)) fail('INVALID_VAULT', 'Presets/customGroups/galleryNames/preferences inválidos.');
    unityMediaEntries(vault);
    assertNoDataUri(vault);
    assertNoDataUri(cardvault);
    return { classById, skillById, cardById, cardBySkill };
  }

  function projection(vault, cardvault) {
    const cards = new Map(cardvault.cards.map(card => [card.id, card]));
    const legacy = {};
    for (const [key, value] of Object.entries(vault)) {
      if (!['format', 'schemaVersion', 'vaultId', 'transactionId', 'revision', 'updatedAt', 'classes', 'skills', 'links', 'presets', 'customGroups', 'galleryNames', 'preferences', 'sourceHash', 'keywords'].includes(key)) legacy[key] = clone(value);
    }
    legacy.schemaVersion = 3;
    legacy.classes = vault.classes.map(cls => {
      const out = clone(cls);
      out.image = cls.imagePath || '';
      return out;
    });
    legacy.skills = vault.skills.map(skill => {
      const out = clone(skill);
      const card = cards.get(skill.cardId);
      out.card = cardBody(card);
      out.cardId = skill.cardId;
      return out;
    });
    legacy.links = clone(vault.links);
    legacy.presets = clone(vault.presets);
    legacy.customGroups = clone(vault.customGroups);
    legacy.galleryNames = clone(vault.galleryNames);
    legacy.preferences = clone(vault.preferences);
    legacy.keywords = clone(cardvault.keywords || []);
    legacy.galleryCards = cardvault.cards.filter(card => card.source.kind === 'independent').map(card => {
      const out = {};
      for (const [key, value] of Object.entries(card)) if (!CARD_METADATA.has(key) && !['rarity', 'type', 'subtype', 'element', 'cost', 'ruleText', 'flavourText', 'artPath', 'tags'].includes(key)) out[key] = clone(value);
      out.id = card.id;
      out.category = card.category;
      out.slot = card.slot;
      out.name = card.legacyName ?? card.name;
      out.card = cardBody(card);
      return out;
    });
    return legacy;
  }

  function resultFor(vault, cardvault) {
    const legacy = projection(vault, cardvault);
    return { legacy, vault: clone(vault), cardvault: clone(cardvault) };
  }

  let currentPair;
  async function readPair() {
    if (currentPair === undefined) currentPair = await repository.read();
    return currentPair;
  }

  async function loadInternal({ includeBackups = false } = {}) {
    const pair = await readPair();
    if (!pair) return { state: 'empty' };
    return { state: 'ready', ...resultFor(pair.vault, pair.cardvault), backups: includeBackups ? await repository.backups() : [] };
  }

  async function commitPair(inputVault, inputCardvault) {
    const existing = await readPair();
    const vault = clone(inputVault);
    const cardvault = clone(inputCardvault);
    const priorRevision = existing?.vault.revision || 0;
    const revision = Math.max(priorRevision, Number(vault.revision) || 0, Number(cardvault.revision) || 0) + 1;
    const transactionId = `tx-${crypto.randomUUID()}`;
    const vaultId = existing?.vault.vaultId || vault.vaultId || cardvault.vaultId || `lcs-${crypto.randomUUID()}`;
    const updatedAt = isoNow();
    Object.assign(vault, { format: VAULT_FORMAT, schemaVersion: SCHEMA_VERSION, vaultId, transactionId, revision, updatedAt });
    Object.assign(cardvault, { format: CARDVAULT_FORMAT, schemaVersion: SCHEMA_VERSION, vaultId, transactionId, revision, updatedAt });
    vault.classes = vault.classes.map(cls => ({ ...cls, parentId: cls.parentId || null }));
    for (const card of cardvault.cards) {
      delete card.subtype;
      delete card.rarity;
      if (card.status === 'CONFIRMADO') card.confirmedGameplayHash = gameplayHash(card);
    }
    cardvault.cards.sort((a, b) => a.id.localeCompare(b.id));
    validatePair(vault, cardvault);
    await validateMediaReferences(vault, cardvault);
    const pair = { vault, cardvault };
    await repository.commit(existing, pair);
    currentPair = pair;
    return pair;
  }

  function normalCardBody(raw, fallbackName, fallbackTags) {
    const input = isObject(raw) ? clone(raw) : {};
    const artInput = input.artPath ?? input.art ?? null;
    delete input.art;
    delete input.subtype;
    delete input.rarity;
    return {
      ...input,
      name: typeof input.name === 'string' && input.name ? input.name : fallbackName,
      type: typeof input.type === 'string' ? input.type : 'Attack',
      element: typeof input.element === 'string' ? input.element : 'Neutral',
      workflowStatus: typeof input.workflowStatus === 'string' ? input.workflowStatus : 'draft',
      cost: input.cost == null ? '1' : String(input.cost),
      nameFontSize: input.nameFontSize === undefined ? 17 : input.nameFontSize,
      typeFontSize: input.typeFontSize === undefined ? 6 : input.typeFontSize,
      elementFontSize: input.elementFontSize === undefined ? 6 : input.elementFontSize,
      ruleText: typeof input.ruleText === 'string' ? input.ruleText : '',
      flavourText: typeof input.flavourText === 'string' ? input.flavourText : '',
      ruleFontSize: input.ruleFontSize === undefined ? 10 : input.ruleFontSize,
      flavourFontSize: input.flavourFontSize === undefined ? 7 : input.flavourFontSize,
      ruleTextOffsetY: input.ruleTextOffsetY === undefined ? 0 : input.ruleTextOffsetY,
      flavourTextOffsetY: input.flavourTextOffsetY === undefined ? 0 : input.flavourTextOffsetY,
      tags: input.tags === undefined ? dedupeStrings(fallbackTags) : dedupeStrings(input.tags),
      artPath: artInput
    };
  }

  function validateCardBody(body, id, allowEmptyEnums = false) {
    if (!body.name.trim()) fail('INVALID_CARD', `Carta ${id} precisa de nome.`);
    if (!TYPES.has(body.type) && !(allowEmptyEnums && body.type === '')) fail('INVALID_CARD', `Tipo inválido em ${id}.`);
    if (!ELEMENTS.has(body.element) && !(allowEmptyEnums && body.element === '')) fail('INVALID_CARD', `Elemento inválido em ${id}.`);
    if (!/^(?:X|[0-5])$/.test(body.cost) && !(allowEmptyEnums && body.cost === '')) fail('INVALID_CARD', `Custo inválido em ${id}.`);
    if (!WORKFLOW_STATUSES.has(body.workflowStatus)) fail('INVALID_CARD', `workflowStatus inválido em ${id}.`);
    if (typeof body.ruleText !== 'string' || typeof body.flavourText !== 'string') fail('INVALID_CARD', `Textos inválidos em ${id}.`);
    for (const [field, min, max] of [['nameFontSize', 8, 32], ['typeFontSize', 4, 24], ['elementFontSize', 4, 24], ['ruleFontSize', 4, 32], ['flavourFontSize', 4, 32], ['ruleTextOffsetY', -50, 50], ['flavourTextOffsetY', -50, 50]]) {
      const value = body[field];
      if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) fail('INVALID_CARD', `${field} fora do intervalo em ${id}.`);
    }
  }

  async function saveLegacyInternal(input) {
    const current = await loadInternal({ includeBackups: false });
    if (current.state === 'recovery') fail('RECOVERY_REQUIRED', 'Vault inválido ou commit pendente. Recupere explicitamente antes de salvar.', current.error);
    const raw = isObject(input?.data) ? { ...input, ...input.data } : input;
    if (!isObject(raw) || !Array.isArray(raw.classes) || !Array.isArray(raw.skills)) fail('INVALID_INPUT', 'Modelo V0.4 precisa conter classes e skills.');
    validateTopology(raw.classes);
    const oldVault = current.state === 'ready' ? current.vault : null;
    const oldCards = current.state === 'ready' ? current.cardvault.cards : [];
    const oldCardById = new Map(oldCards.map(card => [card.id, card]));
    const oldSkillById = new Map((oldVault?.skills || []).map(skill => [skill.id, skill]));
    const vault = Object.create(null);
    const oldReserved = new Set(['format', 'schemaVersion', 'vaultId', 'transactionId', 'revision', 'updatedAt', 'classes', 'skills', 'links', 'presets', 'customGroups', 'galleryCards', 'galleryNames', 'preferences', 'keywords', 'data']);
    for (const [key, value] of Object.entries(raw)) if (!oldReserved.has(key)) vault[key] = clone(value);
    if (oldVault) for (const [key, value] of Object.entries(oldVault)) if (!oldReserved.has(key) && !(key in vault)) vault[key] = clone(value);
    vault.vaultId = oldVault?.vaultId || `lcs-${crypto.randomUUID()}`;
    vault.classes = [];
    for (const original of raw.classes) {
      const cls = clone(original);
      cls.tags = dedupeStrings(cls.tags || []);
      const image = cls.imagePath ?? cls.image ?? '';
      cls.imagePath = image ? await migrateMedia(image) : null;
      delete cls.image;
      vault.classes.push(cls);
    }
    vault.classes = vault.classes.map(cls => ({ ...cls, parentId: cls.tier === 'C1' ? null : cls.parentId }));
    const normalizedClassById = validateTopology(vault.classes);
    if (oldVault) validateStableTopology(oldVault.classes, vault.classes);
    const incomingSkills = raw.skills.map(skill => clone(skill));
    const seenSkills = new Set();
    const skills = [];
    const cards = [];
    for (const skill of incomingSkills) {
      if (!isObject(skill)) fail('INVALID_SKILL', 'Skill inválida no modelo de entrada.');
      skill.tags = dedupeStrings(skill.tags || []);
      safeId(skill.id, 'skill.id'); safeId(skill.classId, 'skill.classId');
      if (seenSkills.has(skill.id)) fail('INVALID_SKILL', `Skill duplicada: ${skill.id}`);
      if (!normalizedClassById.has(skill.classId)) fail('INVALID_SKILL', `Classe da skill não existe: ${skill.classId}`);
      seenSkills.add(skill.id);
      const priorSkill = oldSkillById.get(skill.id);
      if (priorSkill?.cardId && skill.cardId && skill.cardId !== priorSkill.cardId) fail('CARD_ID_IMMUTABLE', `cardId da skill ${skill.id} é imutável.`);
      const existingId = priorSkill?.cardId || skill.cardId || makeId('card-skill', skill.id);
      safeId(existingId, 'skill.cardId');
      const existing = oldCardById.get(existingId);
      const src = sourceSnapshot(skill, normalizedClassById);
      const bodyInput = isObject(skill.card) ? skill.card : {};
      const body = normalCardBody(bodyInput, skill.name || 'Nova skill', skill.tags || []);
      if (existing && !Object.hasOwn(bodyInput, 'type')) body.type = existing.type;
      if (existing && !Object.hasOwn(bodyInput, 'element')) body.element = existing.element;
      if (existing && !Object.hasOwn(bodyInput, 'workflowStatus')) body.workflowStatus = existing.workflowStatus || 'draft';
      if (existing && !Object.hasOwn(bodyInput, 'tags')) body.tags = clone(existing.tags || []);
      syncElementTag(body, existing);
      const incomingArt = body.artPath;
      body.artPath = incomingArt ? await migrateMedia(incomingArt) : (existing?.artPath ?? null);
      if (existing && existing.status === 'CONFIRMADO') {
        const candidate = { ...existing, ...body };
        if (gameplayHash(candidate) !== gameplayHash(existing)) fail('CONFIRMED_CARD_LOCKED', `Gameplay da carta confirmada ${existing.id} mudou. Desconfirme antes de editar.`);
      }
      if (existing && existing.status === 'RASCUNHO') {
        const oldSnap = existing.sourceSnapshot || src;
        const incoming = isObject(skill.card) ? skill.card : {};
        const nameUnchanged = !Object.hasOwn(incoming, 'name') || incoming.name === existing.name;
        const tagsUnchanged = !Object.hasOwn(incoming, 'tags') || sameJson(incoming.tags, existing.tags || []);
        if (nameUnchanged && existing.name === oldSnap.name && oldSnap.name !== src.name) body.name = src.name;
        if (tagsUnchanged && sameJson(existing.tags || [], oldSnap.tags || []) && !sameJson(src.tags, oldSnap.tags || [])) body.tags = clone(src.tags);
      }
      validateCardBody(body, existingId);
      const card = {
        ...(existing || {}),
        ...body,
        id: existingId,
        category: 'class',
        slot: existing?.status === 'CONFIRMADO' ? existing.slot : Number(src.rootClassId ? normalizedClassById.get(src.rootClassId).statedPath.slice(3) : -1),
        status: existing?.status || 'RASCUNHO',
        source: { kind: 'skill', skillId: skill.id, classId: skill.classId, rootClassId: src.rootClassId },
        createdAt: existing?.createdAt || isoNow(),
        updatedAt: isoNow(),
        confirmedAt: existing?.confirmedAt ?? null,
        confirmedRevision: existing?.confirmedRevision ?? null,
        confirmedGameplayHash: existing?.confirmedGameplayHash ?? null,
        sourceRevisionAtSync: existing?.sourceRevisionAtSync ?? 1,
        sourceSnapshot: existing?.status === 'CONFIRMADO' ? clone(existing.sourceSnapshot || sourceSnapshot(priorSkill || skill, normalizedClassById)) : clone(src),
        divergence: existing?.status === 'CONFIRMADO' ? sourceDiff(existing.sourceSnapshot || sourceSnapshot(priorSkill || skill, normalizedClassById), src) : { hasPendingSourceChanges: false, fields: [] }
      };
      delete card.rarity;
      delete card.subtype;
      if (card.status === 'RASCUNHO') card.divergence = { hasPendingSourceChanges: false, fields: [] };
      skill.cardId = existingId;
      delete skill.card;
      skills.push(skill);
      cards.push(card);
    }

    const independentIds = new Set();
    for (const [index, gallery] of (Array.isArray(raw.galleryCards) ? raw.galleryCards : []).entries()) {
      if (!isObject(gallery)) fail('INVALID_CARD', 'Carta independente inválida.');
      const category = gallery.category;
      const slot = gallery.slot;
      if (!CATEGORIES.has(category) || !Number.isInteger(slot) || slot < 0 || slot > 14) fail('INVALID_CARD', `Categoria/slot inválido na carta independente ${index}.`);
      const id = gallery.id ? safeId(gallery.id, 'galleryCard.id') : makeId('card-gallery', `${category}:${slot}:${index}:${stableJson(gallery)}`);
      if (independentIds.has(id)) fail('INVALID_CARD', `Carta independente duplicada: ${id}`);
      independentIds.add(id);
      const existing = oldCardById.get(id);
      const bodyInput = isObject(gallery.card) ? gallery.card : {};
      const body = normalCardBody(bodyInput, gallery.name || 'Nova carta', []);
      if (existing && !Object.hasOwn(bodyInput, 'type')) body.type = existing.type;
      if (existing && !Object.hasOwn(bodyInput, 'element')) body.element = existing.element;
      if (existing && !Object.hasOwn(bodyInput, 'workflowStatus')) body.workflowStatus = existing.workflowStatus || 'draft';
      if (!Object.hasOwn(bodyInput, 'tags') && existing) body.tags = clone(existing.tags || []);
      syncElementTag(body, existing);
      body.artPath = body.artPath ? await migrateMedia(body.artPath) : (existing?.artPath ?? null);
      const candidate = { ...existing, ...body, id, category, slot };
      if (existing?.status === 'CONFIRMADO' && gameplayHash(candidate) !== gameplayHash(existing)) fail('CONFIRMED_CARD_LOCKED', `Gameplay da carta confirmada ${id} mudou. Desconfirme antes de editar.`);
      const hasNoteMetadata = gallery.noteOwnerId != null || gallery.noteTier != null;
      const noteContext = hasNoteMetadata
        ? freeNoteDraftContext(gallery.noteOwnerId, gallery.noteTier, gallery.layoutClassId, category, slot, normalizedClassById)
        : null;
      if (hasNoteMetadata && !noteContext) fail('INVALID_CARD', 'Associação Free Note inválida.');
      validateCardBody(body, id, hasNoteMetadata && existing?.status !== 'CONFIRMADO');
      const extra = {};
      for (const [key, value] of Object.entries(gallery)) if (!['card', 'id', 'category', 'slot', 'name'].includes(key)) extra[key] = clone(value);
      const card = {
        ...(existing || {}), ...extra, ...body, id, category, slot,
        legacyName: gallery.name ?? existing?.legacyName ?? body.name,
        status: existing?.status || 'RASCUNHO',
        source: { kind: 'independent', skillId: null },
        createdAt: existing?.createdAt || isoNow(), updatedAt: isoNow(),
        confirmedAt: existing?.confirmedAt ?? null,
        confirmedRevision: existing?.confirmedRevision ?? null,
        confirmedGameplayHash: existing?.confirmedGameplayHash ?? null,
        sourceRevisionAtSync: existing?.sourceRevisionAtSync ?? 1,
        divergence: existing?.divergence || { hasPendingSourceChanges: false, fields: [] }
      };
      if (!hasNoteMetadata) {
        delete card.noteOwnerId;
        delete card.noteTier;
      }
      delete card.rarity;
      delete card.subtype;
      cards.push(card);
    }
    for (const oldCard of oldCards) {
      if (oldCard.source.kind === 'skill' && !seenSkills.has(oldCard.source.skillId)) {
        fail('SKILL_CARD_DELETE_REQUIRES_CHOICE', `A skill ${oldCard.source.skillId} foi removida sem uma decisão explícita para sua carta ${oldCard.id}.`);
      }
      if (oldCard.source.kind === 'independent' && !independentIds.has(oldCard.id)) {
        if (oldCard.status === 'CONFIRMADO') fail('CONFIRMED_CARD_DELETE_LOCKED', `Carta confirmada ${oldCard.id} não pode ser removida sem desconfirmar.`);
      }
    }
    // A save can carry the whole projected model. Keep timestamps for records
    // whose canonical fields did not change so the SQL diff stays small.
    for (const card of cards) {
      const previous = oldCardById.get(card.id);
      if (!previous) continue;
      const timestamp = card.updatedAt;
      card.updatedAt = previous.updatedAt;
      if (!sameJson(card, previous)) card.updatedAt = timestamp;
    }
    vault.skills = skills;
    vault.links = clone(raw.links ?? oldVault?.links ?? []);
    vault.presets = clone(raw.presets ?? oldVault?.presets ?? []);
    vault.customGroups = clone(raw.customGroups ?? oldVault?.customGroups ?? { traits: [], custom: [] });
    vault.galleryNames = clone(raw.galleryNames ?? oldVault?.galleryNames ?? {});
    vault.preferences = clone(raw.preferences ?? oldVault?.preferences ?? { effectsEnabled: true });
    const unityMedia = mergeUnityMediaEntries(
      oldVault?.preferences?.unityMedia,
      raw.preferences?.unityMedia
    );
    if (unityMedia.length || Object.hasOwn(vault.preferences, 'unityMedia') || Object.hasOwn(oldVault?.preferences || {}, 'unityMedia')) vault.preferences.unityMedia = unityMedia;
    vault.schemaVersion = SCHEMA_VERSION;
    vault.format = VAULT_FORMAT;
    vault.revision = oldVault?.revision || 0;
    vault.updatedAt = oldVault?.updatedAt || isoNow();
    const keywords = normalizeKeywordRecords(
      Object.hasOwn(raw, 'keywords') ? raw.keywords : (current.state === 'ready' ? current.cardvault.keywords || [] : []),
      current.state === 'ready' ? current.cardvault.keywords || [] : []
    );
    const cardvault = {
      ...(current.state === 'ready' ? Object.fromEntries(Object.entries(current.cardvault).filter(([key]) => !['format', 'schemaVersion', 'vaultId', 'transactionId', 'revision', 'updatedAt', 'cards'].includes(key))) : {}),
      format: CARDVAULT_FORMAT, schemaVersion: SCHEMA_VERSION, vaultId: vault.vaultId, keywords,
      revision: oldVault?.revision || 0, updatedAt: vault.updatedAt, cards
    };
    assertNoDataUri(vault); assertNoDataUri(cardvault);
    const committed = await commitPair(vault, cardvault);

    return resultFor(committed.vault, committed.cardvault);
  }

  async function confirmInternal(cardId) {
    const current = await loadInternal({ includeBackups: false });
    if (current.state !== 'ready') fail(current.state === 'empty' ? 'EMPTY_VAULT' : 'RECOVERY_REQUIRED', current.error || 'Vault não está pronto para confirmar.');
    const cards = clone(current.cardvault);
    const card = cards.cards.find(item => item.id === cardId);
    if (!card) fail('CARD_NOT_FOUND', `Carta não encontrada: ${cardId}`);
    if (card.status === 'CONFIRMADO') return { ...resultFor(current.vault, current.cardvault), card: clone(card), unchanged: true };
    const noteDraft = card.noteOwnerId != null && card.noteTier != null;
    validateCardBody(card, card.id, noteDraft);
    if (noteDraft && (!TYPES.has(card.type) || !ELEMENTS.has(card.element) || !/^(?:X|[0-5])$/.test(card.cost))) fail('CARD_FIELDS_REQUIRED', 'Escolha tipo, elemento e custo antes de confirmar esta carta.');
    if (!card.ruleText.trim()) fail('CARD_RULE_TEXT_REQUIRED', `Preencha Rule Text antes de confirmar ${card.id}.`);
    if (card.artPath) await resolveMedia(card.artPath, true);
    if (card.source.kind === 'skill') {
      const skill = current.vault.skills.find(item => item.id === card.source.skillId);
      if (!skill || skill.cardId !== card.id) fail('INVALID_CARD', 'A skill e a carta não estão vinculadas reciprocamente.');
    }
    const targetRevision = current.vault.revision + 1;
    card.status = 'CONFIRMADO';
    card.confirmedAt = isoNow();
    card.confirmedRevision = targetRevision;
    card.confirmedGameplayHash = gameplayHash(card);
    card.updatedAt = card.confirmedAt;
    const committed = await commitPair(current.vault, cards);
    const saved = committed.cardvault.cards.find(item => item.id === cardId);
    return { ...resultFor(committed.vault, committed.cardvault), card: clone(saved) };
  }

  async function unconfirmInternal(cardId) {
    const current = await loadInternal({ includeBackups: false });
    if (current.state !== 'ready') fail(current.state === 'empty' ? 'EMPTY_VAULT' : 'RECOVERY_REQUIRED', current.error || 'Vault não está pronto para desconfirmar.');
    const cards = clone(current.cardvault);
    const card = cards.cards.find(item => item.id === cardId);
    if (!card) fail('CARD_NOT_FOUND', `Carta não encontrada: ${cardId}`);
    if (card.status === 'RASCUNHO') return { ...resultFor(current.vault, current.cardvault), card: clone(card), unchanged: true };
    card.status = 'RASCUNHO';
    card.confirmedAt = null;
    card.confirmedRevision = null;
    card.confirmedGameplayHash = null;
    card.updatedAt = isoNow();
    card.divergence = { hasPendingSourceChanges: false, fields: [] };
    if (card.source.kind === 'skill') {
      const { classById } = validatePair(current.vault, current.cardvault);
      const skill = current.vault.skills.find(item => item.id === card.source.skillId);
      const owner = skill && classById.get(skill.classId);
      const root = owner && rootClass(owner, classById);
      if (!skill || !root) fail('INVALID_CARD', 'Não foi possível resolver a origem da carta para desconfirmar.');
      card.source.classId = skill.classId;
      card.source.rootClassId = root.id;
      card.slot = Number(root.statedPath.slice(3));
      card.sourceSnapshot = clone(sourceSnapshot(skill, classById));
    }
    const committed = await commitPair(current.vault, cards);
    const saved = committed.cardvault.cards.find(item => item.id === cardId);
    return { ...resultFor(committed.vault, committed.cardvault), card: clone(saved) };
  }

  async function deleteSkillInternal(skillId, disposition) {
    safeId(skillId, 'skillId');
    if (!['keep-card', 'delete-card'].includes(disposition)) fail('INVALID_DISPOSITION', 'Escolha explicitamente keep-card ou delete-card.');
    const current = await loadInternal({ includeBackups: false });
    if (current.state !== 'ready') fail(current.state === 'empty' ? 'EMPTY_VAULT' : 'RECOVERY_REQUIRED', current.error || 'Vault não está pronto para excluir skill.');
    const skill = current.vault.skills.find(item => item.id === skillId);
    if (!skill) fail('SKILL_NOT_FOUND', `Skill não encontrada: ${skillId}`);
    const card = current.cardvault.cards.find(item => item.id === skill.cardId);
    if (!card || card.source.kind !== 'skill' || card.source.skillId !== skillId) fail('INVALID_CARD', `Carta vinculada inválida para ${skillId}.`);
    if (disposition === 'delete-card' && card.status === 'CONFIRMADO') fail('CONFIRMED_CARD_DELETE_LOCKED', `Desconfirme ${card.id} antes de excluir sua carta.`);
    const vault = clone(current.vault);
    const cardvault = clone(current.cardvault);
    vault.skills = vault.skills.filter(item => item.id !== skillId);
    const retiredIds = new Set([skillId]);
    if (disposition === 'keep-card') {
      const kept = cardvault.cards.find(item => item.id === card.id);
      kept.source = { ...kept.source, kind: 'independent', skillId: null };
      kept.divergence = { hasPendingSourceChanges: false, fields: [] };
      kept.updatedAt = isoNow();
    } else {
      retiredIds.add(card.id);
      cardvault.cards = cardvault.cards.filter(item => item.id !== card.id);
    }
    let archivedLinks = 0;
    vault.links = vault.links.map(link => {
      if ((retiredIds.has(link.from) || retiredIds.has(link.to)) && !link.archived) {
        archivedLinks++;
        return { ...link, archived: true, archivedAt: isoNow(), archiveReason: 'entity-deleted' };
      }
      return link;
    });
    const committed = await commitPair(vault, cardvault);
    return {
      ...resultFor(committed.vault, committed.cardvault),
      deletedSkillId: skillId,
      disposition,
      keptCardId: disposition === 'keep-card' ? card.id : null,
      deletedCardId: disposition === 'delete-card' ? card.id : null,
      archivedLinks
    };
  }

  async function deleteCardsInternal(cardIds) {
    if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 315) fail('INVALID_CARD_IDS', 'Selecione entre 1 e 315 cartas para excluir.');
    const ids = cardIds.map(id => safeId(id, 'cardId'));
    if (new Set(ids).size !== ids.length) fail('INVALID_CARD_IDS', 'A lista de cartas contém IDs repetidos.');
    const current = await loadInternal({ includeBackups: false });
    if (current.state !== 'ready') fail(current.state === 'empty' ? 'EMPTY_VAULT' : 'RECOVERY_REQUIRED', current.error || 'Vault não está pronto para excluir cartas.');
    const cardsById = new Map(current.cardvault.cards.map(card => [card.id, card]));
    const selected = ids.map(id => {
      const card = cardsById.get(id);
      if (!card) fail('CARD_NOT_FOUND', `Carta não encontrada: ${id}`);
      return card;
    });
    const deletedSkills = new Set();
    const deletedEntities = new Set(ids);
    for (const card of selected) {
      if (card.source.kind !== 'skill') continue;
      const skill = current.vault.skills.find(item => item.id === card.source.skillId);
      if (!skill || skill.cardId !== card.id) fail('INVALID_CARD', `Vínculo da carta ${card.id} está inconsistente.`);
      deletedSkills.add(skill.id);
      deletedEntities.add(skill.id);
    }
    const vault = clone(current.vault);
    const cardvault = clone(current.cardvault);
    vault.skills = vault.skills.filter(skill => !deletedSkills.has(skill.id));
    cardvault.cards = cardvault.cards.filter(card => !ids.includes(card.id));
    let archivedLinks = 0;
    vault.links = vault.links.map(link => {
      if ((deletedEntities.has(link.from) || deletedEntities.has(link.to)) && !link.archived) {
        archivedLinks++;
        return { ...link, archived: true, archivedAt: isoNow(), archiveReason: 'entity-deleted' };
      }
      return link;
    });
    const committed = await commitPair(vault, cardvault);
    return {
      ...resultFor(committed.vault, committed.cardvault),
      deletedCardIds: ids,
      deletedSkillIds: [...deletedSkills],
      archivedLinks
    };
  }

  async function recoverInternal(id) {
    const backup = await repository.readBackup(id);
    if (!backup) fail('BACKUP_NOT_FOUND', 'Backup não encontrado.');
    await commitPair(backup.vault, backup.cardvault);
    return loadInternal();
  }

  async function exportBackupInternal() {
    const pair = await readPair();
    if (!pair) fail('EMPTY_VAULT', 'Importe um Vault antes de exportar.');
    return repository.createBackup(pair);
  }

  return Object.freeze({
    load: loadInternal,
    async importPair(vault, cardvault) {
      if (await readPair()) fail('VAULT_EXISTS', 'O workspace já foi importado.');
      validatePair(vault, cardvault);
      if (vault.schemaVersion !== SCHEMA_VERSION) fail('INVALID_SCHEMA', 'A importação precisa do schema atual do desktop.');
      await validateMediaReferences(vault, cardvault);
      const pair = { vault, cardvault };
      await repository.commit(null, pair);
      currentPair = pair;
      return { revision: vault.revision, classes: vault.classes.length, cards: cardvault.cards.length };
    },
    saveLegacy: saveLegacyInternal,
    confirm: confirmInternal,
    unconfirm: unconfirmInternal,
    deleteSkill: deleteSkillInternal,
    deleteCards: deleteCardsInternal,
    importMedia: importMediaInternal,
    exportBackup: exportBackupInternal,
    recover: recoverInternal
  });
}

module.exports = { createVaultService, gameplayHash, GAMEPLAY_FIELDS, VaultError, mediaPath, sniffMedia, sha256 };
