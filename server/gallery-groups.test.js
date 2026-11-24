import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { listGalleryGroups, renameGalleryGroup } from './gallery-groups.js';

let database;

function makeStorage() {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE settings (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope, key));
    CREATE TABLE cards (category TEXT NOT NULL, slot INTEGER NOT NULL);
    CREATE TABLE workspace (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, transaction_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE vault_revisions (revision INTEGER PRIMARY KEY, transaction_id TEXT, updated_at TEXT, actor TEXT, action TEXT);
    CREATE TABLE audit_events (event_id TEXT PRIMARY KEY, revision INTEGER, actor TEXT, action TEXT, resource TEXT, resource_id TEXT, resource_name TEXT, changed_fields TEXT, details TEXT, created_at TEXT);
    INSERT INTO workspace VALUES (1, 12, 'tx-old', '2026-11-23T00:00:00.000Z');
    INSERT INTO cards VALUES ('enemy', 0), ('enemy', 0), ('enemy', 4), ('species', 0);
    INSERT INTO settings VALUES ('galleryNames', 'enemy:4', '"Wraiths"');
  `);
  const sql = {
    exec(query, ...params) {
      const statement = database.prepare(query);
      const rows = statement.all(...params);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
  return { sql, transactionSync: callback => callback() };
}

function query(value) { return new URLSearchParams(value); }

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('gallery category groups', () => {
  it('returns fifteen scoped groups and category-specific labels/counts', () => {
    const storage = makeStorage();
    const enemy = listGalleryGroups(storage.sql, query('category=enemy'));
    const species = listGalleryGroups(storage.sql, query('category=species'));
    expect(enemy.items).toHaveLength(15);
    expect(enemy.items[0]).toMatchObject({ slot: 0, name: 'Enemy', count: 2 });
    expect(enemy.items[4]).toMatchObject({ slot: 4, name: 'Wraiths', count: 1 });
    expect(species.items[0]).toMatchObject({ slot: 0, name: 'Species', count: 1 });
    expect(() => listGalleryGroups(storage.sql, query('category=class'))).toThrow('Categoria de grupos inválida.');
  });

  it('renames only the selected category/slot, increments revision, and audits the change', () => {
    const storage = makeStorage();
    const current = listGalleryGroups(storage.sql, query('category=enemy')).items[4];
    const saved = renameGalleryGroup(storage, { category: 'enemy', slot: 4, name: 'Night Court', expected: current.version, actor: 'roger@example.test' });
    const otherCategory = listGalleryGroups(storage.sql, query('category=species')).items[4];
    const audit = storage.sql.exec('SELECT * FROM audit_events').toArray()[0];
    expect(saved).toMatchObject({ category: 'enemy', slot: 4, name: 'Night Court', revision: 13, count: 1 });
    expect(listGalleryGroups(storage.sql, query('category=enemy')).items[4]?.name).toBe('Night Court');
    expect(otherCategory.name).toBe('Species');
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
    expect(audit).toMatchObject({ actor: 'roger@example.test', action: 'rename', resource: 'gallery_group', resource_id: 'enemy:4' });
    expect(JSON.parse(audit.details)).toMatchObject({ previousName: 'Wraiths', name: 'Night Court' });
  });

  it('rejects stale, invalid, and empty renames without touching storage', () => {
    const storage = makeStorage();
    const current = listGalleryGroups(storage.sql, query('category=enemy')).items[4];
    expect(() => renameGalleryGroup(storage, { category: 'enemy', slot: 4, name: 'Stale', expected: '"old"', actor: 'roger@example.test' })).toThrow('Este grupo mudou');
    expect(() => renameGalleryGroup(storage, { category: 'enemy', slot: 15, name: 'Invalid slot', expected: current.version, actor: 'roger@example.test' })).toThrow('Grupo inválido.');
    expect(() => renameGalleryGroup(storage, { category: 'enemy', slot: 4, name: ' ', expected: current.version, actor: 'roger@example.test' })).toThrow('Use um nome');
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(0);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(12);
  });
});
