import { createHash } from 'node:crypto';
import { HttpError } from './http.js';
import { changedFields, writeAudit } from './audit.js';
import { customTagGroupIds, tagCatalog, tagGroups } from '../shared/tag-catalog.js';

const normalized = value => String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US');
const versionFor = value => createHash('sha256').update(value).digest('hex');

function readCustomGroups(sql) {
  return Object.fromEntries(sql.exec("SELECT key, value FROM settings WHERE scope = 'customGroups'").toArray()
    .map(row => [row.key, { raw: row.value, parsed: JSON.parse(row.value) }]));
}

function customEntries(value) {
  const entries = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
  return entries.flatMap(entry => {
    if (typeof entry === 'string' && entry.trim()) return [{ value: entry.trim(), label: entry.trim() }];
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].trim()) {
      const tag = entry[0].trim();
      return [{ value: tag, label: typeof entry[1] === 'string' && entry[1].trim() ? entry[1].trim() : tag }];
    }
    if (entry && typeof entry === 'object') {
      const tag = [entry.id, entry.tag, entry.value, entry.name].find(item => typeof item === 'string' && item.trim());
      if (tag) return [{ value: tag.trim(), label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : tag.trim() }];
    }
    return [];
  });
}

function groupsFrom(sql) {
  const stored = readCustomGroups(sql);
  return tagGroups.map(group => {
    const custom = group.custom === true;
    const raw = custom ? stored[group.id]?.raw ?? '[]' : JSON.stringify(group.tags);
    const tags = custom ? customEntries(stored[group.id]?.parsed) : group.tags.map(value => ({ value, label: value }));
    return { id: group.id, label: group.label, structural: group.structural === true, custom, tags, version: versionFor(raw) };
  });
}

export function listTagGroups(sql) {
  return { groups: groupsFrom(sql) };
}

export function createCustomTag(storage, { input, expected, actor }) {
  const { sql } = storage;
  return storage.transactionSync(() => {
    const groupId = input?.group;
    if (!customTagGroupIds.includes(groupId)) throw new HttpError(422, 'Escolha o grupo Traits ou Custom.');
    if (typeof input?.value !== 'string') throw new HttpError(422, 'Informe o nome da tag.');
    const value = input.value.normalize('NFKC').trim();
    const label = typeof input.label === 'string' ? input.label.normalize('NFKC').trim() : value;
    if (!value || value.length > 80 || !label || label.length > 80) throw new HttpError(422, 'Tag e rótulo devem ter entre 1 e 80 caracteres.');

    const stored = readCustomGroups(sql);
    const current = stored[groupId]?.parsed ?? [];
    const entries = customEntries(current);
    const sameGroup = entries.find(tag => normalized(tag.value) === normalized(value));
    const matching = sameGroup ?? groupsFrom(sql).flatMap(group => group.tags).find(tag => normalized(tag.value) === normalized(value));
    const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
    if (!head) throw new HttpError(409, 'Importe o Vault antes de criar tags.');
    if (sameGroup) return { group: groupId, tag: sameGroup, version: stored[groupId]?.raw ? versionFor(stored[groupId].raw) : versionFor('[]'), revision: head.revision, unchanged: true };
    if (matching || tagCatalog.has(value)) throw new HttpError(409, 'Esta tag já existe em outro grupo.', 'TAG_ALREADY_EXISTS');
    if (!expected) throw new HttpError(428, 'Recarregue o grupo de tags antes de adicionar uma tag.');
    const previousRaw = stored[groupId]?.raw ?? '[]';
    if (versionFor(previousRaw) !== expected) throw new HttpError(409, 'O grupo mudou em outra sessão. Atualize a lista de tags antes de tentar novamente.', 'TAG_GROUP_CHANGED');
    if (entries.length >= 10) throw new HttpError(422, 'Este grupo já contém o máximo de 10 tags.');

    const next = [...entries.map(tag => [tag.value, tag.label]), [value, label]];
    const nextRaw = JSON.stringify(next);
    const now = new Date().toISOString();
    const revision = head.revision + 1;
    const transaction = 'tx-' + crypto.randomUUID();
    sql.exec(`INSERT INTO settings (scope, key, value) VALUES ('customGroups', ?, ?)
      ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`, groupId, nextRaw);
    sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, now, actor, `create customGroups/${groupId}`);
    writeAudit(sql, {
      revision, actor, action: 'create', resource: 'tag', resourceId: `${groupId}:${value}`, resourceName: label,
      changedFields: changedFields({ [groupId]: entries }, { [groupId]: customEntries(nextRaw ? JSON.parse(nextRaw) : []) }),
      details: { group: groupId, tag: value }, createdAt: now,
    });
    sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, now);
    return { group: groupId, tag: { value, label }, version: versionFor(nextRaw), revision };
  });
}
