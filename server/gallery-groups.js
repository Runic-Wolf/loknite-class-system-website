import { createHash } from 'node:crypto';
import { HttpError } from './http.js';
import { writeAudit } from './audit.js';

const categories = new Map([
  ['enemy', 'Enemy'], ['neutral', 'Neutral'], ['equipment', 'Equipment'],
  ['species', 'Species'], ['status', 'Status'],
]);

function fallbackName(category) {
  return categories.get(category) ?? 'Group';
}

function versionFor(category, slot, name) {
  return '"' + createHash('sha256').update(`${category}:${slot}:${name}`).digest('base64url') + '"';
}

function currentName(sql, category, slot) {
  const key = `${category}:${slot}`;
  const row = sql.exec("SELECT value FROM settings WHERE scope = 'galleryNames' AND key = ?", key).toArray()[0];
  if (!row) return fallbackName(category);
  try {
    const stored = JSON.parse(row.value);
    return typeof stored === 'string' && stored.trim() ? stored.trim().slice(0, 46) : fallbackName(category);
  } catch {
    return fallbackName(category);
  }
}

function countFor(sql, category, slot) {
  return sql.exec('SELECT count(*) AS total FROM cards WHERE category = ? AND slot = ?', category, slot).one().total;
}

export function listGalleryGroups(sql, params) {
  const category = params.get('category');
  if (!categories.has(category)) throw new HttpError(422, 'Categoria de grupos inválida.');
  const counts = new Map(sql.exec('SELECT slot, count(*) AS total FROM cards WHERE category = ? GROUP BY slot', category)
    .toArray().map(row => [row.slot, row.total]));
  const items = Array.from({ length: 15 }, (_, slot) => {
    const name = currentName(sql, category, slot);
    return { slot, name, count: counts.get(slot) ?? 0, version: versionFor(category, slot, name) };
  });
  return { category, items };
}

export function renameGalleryGroup(storage, { category, slot, name, expected, actor }) {
  if (!categories.has(category)) throw new HttpError(422, 'Categoria de grupos inválida.');
  if (!Number.isInteger(slot) || slot < 0 || slot > 14) throw new HttpError(422, 'Grupo inválido.');
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 46) {
    throw new HttpError(422, 'Use um nome de grupo entre 1 e 46 caracteres.');
  }
  const normalized = name.trim();
  return storage.transactionSync(() => {
    const { sql } = storage;
    const before = currentName(sql, category, slot);
    if (!expected) throw new HttpError(428, 'Recarregue o grupo antes de renomear.');
    if (expected !== versionFor(category, slot, before)) throw new HttpError(409, 'Este grupo mudou desde que você o abriu. Atualize para comparar.');
    if (before === normalized) return { category, slot, name: before, version: expected, count: countFor(sql, category, slot), unchanged: true };

    const key = `${category}:${slot}`;
    if (normalized === fallbackName(category)) {
      sql.exec("DELETE FROM settings WHERE scope = 'galleryNames' AND key = ?", key);
    } else {
      sql.exec(`INSERT INTO settings(scope, key, value) VALUES ('galleryNames', ?, ?)
        ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`, key, JSON.stringify(normalized));
    }

    const head = sql.exec('SELECT revision FROM workspace WHERE id = 1').toArray()[0];
    if (!head) throw new HttpError(409, 'Importe o Vault antes de renomear grupos.');
    const revision = head.revision + 1;
    const transaction = 'tx-' + crypto.randomUUID();
    const createdAt = new Date().toISOString();
    sql.exec('INSERT INTO vault_revisions VALUES (?, ?, ?, ?, ?)', revision, transaction, createdAt, actor, `rename gallery group ${category}:${slot}`);
    sql.exec('UPDATE workspace SET revision = ?, transaction_id = ?, updated_at = ? WHERE id = 1', revision, transaction, createdAt);
    writeAudit(sql, {
      revision, actor, action: 'rename', resource: 'gallery_group', resourceId: key,
      resourceName: `${category} · ${normalized}`, changedFields: ['name'],
      details: { category, slot, previousName: before, name: normalized }, createdAt,
    });
    return { category, slot, name: normalized, version: versionFor(category, slot, normalized), count: countFor(sql, category, slot), revision };
  });
}
