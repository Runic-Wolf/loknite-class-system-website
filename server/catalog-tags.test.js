import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createCustomTag, listTagGroups } from './catalog-tags.js';
import { handleCatalog } from './catalog-api.js';
import { changeTagsForSelection, tagAssignmentsForSelection } from './catalog-tag-batch.js';
import { applyTestMigrations } from './test-database.js';

let database;

function makeStorage() {
  database = new DatabaseSync(':memory:');
  applyTestMigrations(database);
  database.prepare('INSERT INTO workspace (id, vault_id, revision, transaction_id, updated_at) VALUES (1, ?, 12, ?, ?)')
    .run('vault-test', 'tx-seed', '2026-11-23T00:00:00.000Z');
  const sql = {
    exec(query, ...params) {
      const statement = database.prepare(query);
      const rows = statement.all(...params);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
  return {
    sql,
    transactionSync(callback) {
      database.exec('BEGIN IMMEDIATE');
      try { const result = callback(); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
}

function findGroup(sql, id) {
  const group = listTagGroups(sql).groups.find(item => item.id === id);
  if (!group) throw new Error(`Missing tag group ${id}`);
  return group;
}

function seedTagBatchRecords(sql) {
  sql.exec(`INSERT INTO classes (id, tier, parent_id, slot, name, concept, notes, image_path, position, details)
    VALUES ('class-a', 'C1', NULL, 'C1_0', 'Fighter', '', '', NULL, 0, '[{},[]]')`);
  sql.exec(`INSERT INTO cards (id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text,
    status, workflow_status, art_path, position, details) VALUES
    ('card-a', NULL, 'class-a', 'class', 0, 'First card', 'Attack', 'Fire', '1', '', '', 'RASCUNHO', 'draft', NULL, 0, '[{},[]]'),
    ('card-b', NULL, 'class-a', 'class', 0, 'Second card', 'Attack', 'Fire', '1', '', '', 'RASCUNHO', 'draft', NULL, 1, '[{},[]]')`);
  sql.exec('INSERT INTO card_tags (entity_id, tag, position) VALUES (?, ?, ?)', 'card-a', 'DPS', 0);
}

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('shared tag taxonomy', () => {
  it('returns built-in groups and team-defined groups with optimistic versions', () => {
    const storage = makeStorage();
    const result = listTagGroups(storage.sql);

    const roles = findGroup(storage.sql, 'roles');
    expect(roles).toMatchObject({ label: 'Roles', custom: false });
    expect(roles.tags[0]).toEqual({ value: 'DPS', label: 'DPS' });
    expect(result.groups.find(group => group.id === 'traits')).toMatchObject({ custom: true, tags: [] });
    expect(result.groups.find(group => group.id === 'traits')?.version).toHaveLength(64);
  });

  it('creates a shared custom tag as one audited revision and reloads it in the picker catalog', () => {
    const storage = makeStorage();
    const traits = findGroup(storage.sql, 'traits');
    const result = createCustomTag(storage, {
      input: { group: 'traits', value: '  Battle Focus  ' }, expected: traits.version, actor: 'roger@example.test',
    });

    expect(result).toMatchObject({ group: 'traits', tag: { value: 'Battle Focus', label: 'Battle Focus' }, revision: 13 });
    expect(listTagGroups(storage.sql).groups.find(group => group.id === 'traits')?.tags).toEqual([{ value: 'Battle Focus', label: 'Battle Focus' }]);
    expect(storage.sql.exec('SELECT revision, actor, action, resource, resource_name AS resourceName FROM audit_events').one())
      .toMatchObject({ revision: 13, actor: 'roger@example.test', action: 'create', resource: 'tag', resourceName: 'Battle Focus' });
    expect(storage.sql.exec('SELECT value FROM settings WHERE scope = ? AND key = ?', 'customGroups', 'traits').one().value)
      .toBe(JSON.stringify([['Battle Focus', 'Battle Focus']]));
  });

  it('makes a repeated create naturally idempotent and rejects a stale group version', () => {
    const storage = makeStorage();
    const version = findGroup(storage.sql, 'custom').version;
    const first = createCustomTag(storage, { input: { group: 'custom', value: 'Arena' }, expected: version, actor: 'bruno@example.test' });
    const retry = createCustomTag(storage, { input: { group: 'custom', value: 'Arena' }, expected: version, actor: 'bruno@example.test' });

    expect(first.revision).toBe(13);
    expect(retry).toMatchObject({ unchanged: true, revision: 13, tag: { value: 'Arena' } });
    expect(() => createCustomTag(storage, { input: { group: 'custom', value: 'Tactics' }, expected: version, actor: 'roger@example.test' }))
      .toThrow(/mudou em outra sessão/);
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(1);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
  });

  it('rejects built-in collisions, invalid groups, missing versions and groups over ten tags', () => {
    const storage = makeStorage();
    const version = findGroup(storage.sql, 'traits').version;
    expect(() => createCustomTag(storage, { input: { group: 'traits', value: 'dps' }, expected: version, actor: 'bruno@example.test' }))
      .toThrow(/já existe/);
    expect(() => createCustomTag(storage, { input: { group: 'roles', value: 'Brawler' }, expected: version, actor: 'bruno@example.test' }))
      .toThrow(/Traits ou Custom/);
    expect(() => createCustomTag(storage, { input: { group: 'traits', value: 'Brawler' }, actor: 'bruno@example.test' }))
      .toThrow(/Recarregue/);
    storage.sql.exec('INSERT INTO settings (scope, key, value) VALUES (?, ?, ?)', 'customGroups', 'traits', JSON.stringify(Array.from({ length: 10 }, (_, index) => [`Trait ${index}`, `Trait ${index}`])));
    const fullVersion = findGroup(storage.sql, 'traits').version;
    expect(() => createCustomTag(storage, { input: { group: 'traits', value: 'Extra' }, expected: fullVersion, actor: 'bruno@example.test' }))
      .toThrow(/máximo de 10/);
  });

  it('exposes authenticated taxonomy read and version-checked creation routes', async () => {
    const storage = makeStorage();
    const identity = { email: 'bruno@example.test', admin: true };
    const list = await handleCatalog({
      request: new Request('https://loknite.example/catalog/tags'), storage, identity, path: ['tags'],
    });
    const initial = await list.json();
    const custom = initial.groups.find(group => group.id === 'custom');
    const response = await handleCatalog({
      request: new Request('https://loknite.example/catalog/tags', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': custom.version },
        body: JSON.stringify({ group: 'custom', value: 'Quick Study' }),
      }), storage, identity, path: ['tags'],
    });

    expect(list.status).toBe(200);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ group: 'custom', tag: { value: 'Quick Study' }, revision: 13 });
  });
});

describe('atomic multi-record tag assignment', () => {
  it('upgrades the idempotency enum while preserving existing keys', () => {
    database = new DatabaseSync(':memory:');
    for (const file of [
      '0001_workspace.sql', '0002_objects.sql', '0003_catalog.sql', '0004_audit.sql',
      '0005_enum_guards.sql', '0006_query_indexes.sql', '0007_mutation_idempotency.sql', '0008_card_collection_positions.sql',
    ]) database.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    database.prepare(`INSERT INTO mutation_idempotency VALUES (?, ?, ?, ?, ?, ?)`)
      .run('roger@example.test', 'cards', 'saved-card-create-001', 'a'.repeat(64), '{"id":"card-kept"}', '2026-11-23T00:00:00.000Z');

    database.exec(readFileSync(new URL('../migrations/0009_idempotency_class_resource.sql', import.meta.url), 'utf8'));

    expect(database.prepare('SELECT resource, response_json FROM mutation_idempotency').get())
      .toEqual({ resource: 'cards', response_json: '{"id":"card-kept"}' });
    expect(() => database.prepare(`INSERT INTO mutation_idempotency VALUES (?, ?, ?, ?, ?, ?)`)
      .run('roger@example.test', 'classes', 'saved-class-edit-001', 'b'.repeat(64), '{"id":"class-kept"}', '2026-11-23T00:01:00.000Z')).not.toThrow();
  });

  it('shows mixed state, adds only missing tags, retries idempotently and removes explicitly', () => {
    const storage = makeStorage();
    seedTagBatchRecords(storage.sql);
    expect(tagAssignmentsForSelection(storage.sql, 'cards', { ids: ['card-a', 'card-b'] })).toEqual({
      selectedCount: 2,
      assignments: { 'card-a': ['DPS'], 'card-b': [] },
    });

    const input = { ids: ['card-a', 'card-b'], action: 'add', tag: 'DPS' };
    const first = changeTagsForSelection(storage, { table: 'cards', input, actor: 'roger@example.test', idempotencyKey: 'batch-tag-add-0001' });
    const retry = changeTagsForSelection(storage, { table: 'cards', input, actor: 'roger@example.test', idempotencyKey: 'batch-tag-add-0001' });
    expect(first).toMatchObject({ selectedCount: 2, changedCount: 1, unchangedCount: 1, revision: 13 });
    expect(retry).toEqual(first);
    expect(storage.sql.exec('SELECT entity_id FROM card_tags WHERE tag = ? ORDER BY entity_id', 'DPS').toArray())
      .toEqual([{ entity_id: 'card-a' }, { entity_id: 'card-b' }]);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(1);

    const remove = changeTagsForSelection(storage, {
      table: 'cards', input: { ...input, action: 'remove' }, actor: 'roger@example.test', idempotencyKey: 'batch-tag-remove-0001',
    });
    expect(remove).toMatchObject({ selectedCount: 2, changedCount: 2, unchangedCount: 0, revision: 14 });
    expect(storage.sql.exec('SELECT count(*) AS total FROM card_tags WHERE tag = ?', 'DPS').one().total).toBe(0);
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(2);
  });

  it('keeps class and card idempotency keys in their own database enum namespaces', () => {
    const storage = makeStorage();
    seedTagBatchRecords(storage.sql);
    const idempotencyKey = 'batch-tag-cross-0001';
    changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a'], action: 'add', tag: 'HEAL' }, actor: 'roger@example.test', idempotencyKey,
    });
    changeTagsForSelection(storage, {
      table: 'classes', input: { ids: ['class-a'], action: 'add', tag: 'HEAL' }, actor: 'roger@example.test', idempotencyKey,
    });

    expect(storage.sql.exec('SELECT resource FROM mutation_idempotency ORDER BY resource').toArray())
      .toEqual([{ resource: 'cards' }, { resource: 'classes' }]);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(14);
  });

  it('rejects element and structural tags, stale selections, duplicates and reused keys before mutation', () => {
    const storage = makeStorage();
    seedTagBatchRecords(storage.sql);
    const key = 'batch-tag-check-0001';

    expect(() => changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a'], action: 'add', tag: 'Fire' }, actor: 'bruno@example.test', idempotencyKey: key,
    })).toThrow(/campo Element/);
    expect(() => changeTagsForSelection(storage, {
      table: 'classes', input: { ids: ['class-a'], action: 'add', tag: 'C1' }, actor: 'bruno@example.test', idempotencyKey: key,
    })).toThrow(/estrutural/);
    expect(() => changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a', 'missing'], action: 'add', tag: 'DPS' }, actor: 'bruno@example.test', idempotencyKey: key,
    })).toThrow(/seleção.*mudaram/);
    expect(() => changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a', 'card-a'], action: 'add', tag: 'DPS' }, actor: 'bruno@example.test', idempotencyKey: key,
    })).toThrow(/duplicados/);
    changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a'], action: 'add', tag: 'HEAL' }, actor: 'bruno@example.test', idempotencyKey: key,
    });
    expect(() => changeTagsForSelection(storage, {
      table: 'cards', input: { ids: ['card-a'], action: 'add', tag: 'DPS' }, actor: 'bruno@example.test', idempotencyKey: key,
    })).toThrow(/usada com outros dados/);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(1);
  });

  it('exposes selection summary and batch mutation through authenticated catalog routes', async () => {
    const storage = makeStorage();
    seedTagBatchRecords(storage.sql);
    const identity = { email: 'bruno@example.test', admin: true };
    const summary = await handleCatalog({
      request: new Request('https://loknite.example/catalog/cards/tags/selection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['card-a', 'card-b'] }),
      }),
      storage, identity, path: ['cards', 'tags', 'selection'],
    });
    expect(await summary.json()).toMatchObject({ selectedCount: 2, assignments: { 'card-a': ['DPS'], 'card-b': [] } });

    const result = await handleCatalog({
      request: new Request('https://loknite.example/catalog/cards/tags/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'batch-tag-api-0001' },
        body: JSON.stringify({ ids: ['card-a', 'card-b'], action: 'add', tag: 'HEAL' }),
      }),
      storage, identity, path: ['cards', 'tags', 'bulk'],
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ table: 'cards', action: 'add', tag: 'HEAL', changedCount: 2, revision: 13 });
  });
});
