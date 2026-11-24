import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mutateCatalog } from './catalog-write.js';
import { recordFor } from './catalog-read.js';
import { handleCatalog } from './catalog-api.js';
import { applyTestMigrations } from './test-database.js';

let database;

function makeStorage() {
  database = new DatabaseSync(':memory:');
  applyTestMigrations(database);

  database.exec('BEGIN');
  database.prepare('INSERT INTO workspace (id, vault_id, revision, transaction_id, updated_at) VALUES (1, ?, 12, ?, ?)')
    .run('vault-test', 'tx-seed', '2026-11-23T00:00:00.000Z');
  const addClass = database.prepare('INSERT INTO classes (id, tier, parent_id, slot, name, concept, notes, image_path, position, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  addClass.run('base_0', 'C1', null, 'C1_0', 'Fighter', '', '', null, 0, '[{},[]]');
  addClass.run('knight', 'C2', 'base_0', 'C1_0/C2_0', 'Knight', '', '', null, 1, '[{},[]]');
  addClass.run('rune', 'C3', 'knight', 'C1_0/C2_0/C3_0', 'Rune Knight', '', '', null, 2, '[{},[]]');
  addClass.run('spec', 'SPEC', 'rune', 'C1_0/C2_0/C3_0/SPEC_0', 'Rune Guard', '', '', null, 3, '[{},[]]');
  addClass.run('base_1', 'C1', null, 'C1_1', 'Barbarian', '', '', null, 4, '[{},[]]');
  addClass.run('berserker', 'C2', 'base_1', 'C1_1/C2_0', 'Berserker', '', '', null, 5, '[{},[]]');
  database.prepare(`INSERT INTO cards (
    id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text,
    status, workflow_status, art_path, position, details
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('card-source', 'skill-source', null, 'class', 0, 'Tide Shield Foil', 'Skill', 'Water', '2',
      'Block the next strike.', 'The tide holds.', 'CONFIRMADO', 'audited', 'art/tide.webp', 0,
      JSON.stringify([{ source: { kind: 'skill', skillId: 'skill-source', classId: 'base_0', rootClassId: 'base_0' },
        sourceSnapshot: { name: 'Tide Shield', tags: ['SUPPORT'], classId: 'base_0', rootClassId: 'base_0' },
        createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z',
        confirmedAt: '2026-11-22T00:00:00.000Z', confirmedRevision: 8, confirmedGameplayHash: 'approved-hash',
        divergence: { hasPendingSourceChanges: false, fields: [] }, sourceRevisionAtSync: 1 }, []]));
  database.prepare('INSERT INTO cards (id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, art_path, position, details) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    .run('card-class-neighbor', 'class', 0, 'Nearby class card', 'Attack', 'Fire', '1', 'Strike', '', 'RASCUNHO', 'draft', 1, '[{},[]]');
  database.prepare('INSERT INTO cards (id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, art_path, position, details) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    .run('card-other-category', 'enemy', 0, 'Other collection', 'Attack', 'Fire', '1', 'Claw', '', 'RASCUNHO', 'draft', 50, '[{},[]]');
  const addClassCard = database.prepare('INSERT INTO cards (id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, art_path, position, details) VALUES (?, NULL, NULL, \'class\', 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)');
  addClassCard.run('card-movable', 'Independent draft', 'Attack', 'Fire', '1', 'A short strike.', '', 'RASCUNHO', 'draft', 2,
    JSON.stringify([{ source: { kind: 'independent', skillId: null }, createdAt: '2026-11-20T00:00:00.000Z' }, []]));
  addClassCard.run('card-confirmed', 'Locked version', 'Attack', 'Fire', '1', 'Approved strike.', '', 'CONFIRMADO', 'audited', 3,
    JSON.stringify([{ source: { kind: 'independent', skillId: null } }, []]));
  addClassCard.run('card-mechanic', 'Class mechanic', 'Class Mechanic', 'Arcane', 'X', 'Signature rule.', '', 'RASCUNHO', 'draft', 4,
    JSON.stringify([{ source: { kind: 'independent', skillId: null } }, []]));
  addClassCard.run('card-spec-movable', 'Specialization placement', 'Skill', 'Fire', '2', 'An inherited rule.', '', 'RASCUNHO', 'draft', 5,
    JSON.stringify([{ source: { kind: 'independent', skillId: null }, layoutClassId: 'spec' }, []]));
  database.prepare('INSERT INTO skills (id, class_id, card_id, name, kind, position, details) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('skill-source', 'base_0', 'card-source', 'Tide Shield', 'Active', 0,
      JSON.stringify([{ lcsNotes: 'Studio source note', mobileNotes: 'Short mobile note' }, []]));
  database.prepare('INSERT INTO skill_tags (entity_id, tag, position) VALUES (?, ?, ?)').run('skill-source', 'SUPPORT', 0);
  database.prepare('INSERT INTO skill_tags (entity_id, tag, position) VALUES (?, ?, ?)').run('skill-source', 'MOBILITY', 1);
  database.prepare('INSERT INTO card_tags (entity_id, tag, position) VALUES (?, ?, ?)').run('card-source', 'BARRIER', 0);
  database.prepare('INSERT INTO card_tags (entity_id, tag, position) VALUES (?, ?, ?)').run('card-source', 'Water', 1);
  database.exec('COMMIT');

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

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('catalog skill duplication', () => {
  it('returns the canonical progression slot in a class detail record and its version', async () => {
    const storage = makeStorage();
    const response = await handleCatalog({
      request: new Request('https://loknite.example/catalog/classes/knight'),
      storage,
      identity: { email: 'bruno@example.test', admin: true },
      path: ['classes', 'knight'],
    });
    const result = await response.json();

    expect(result.item).toMatchObject({ id: 'knight', slot: 'C1_0/C2_0', statedPath: 'C1_0/C2_0' });
    expect(result.lineage.at(-1)).toMatchObject({ id: 'knight', slot: 'C1_0/C2_0' });
    expect(result.version).toBe(recordFor(storage.sql, 'classes', 'knight').version);
  });

  it('copies linked gameplay content under new IDs and resets approval/workflow state atomically', () => {
    const storage = makeStorage();
    const source = recordFor(storage.sql, 'skills', 'skill-source');
    const originalSkill = recordFor(storage.sql, 'skills', 'skill-source').item;
    const originalCard = recordFor(storage.sql, 'cards', 'card-source').item;
    const created = mutateCatalog(storage, {
      table: 'skills', id: source.item.id, expected: source.version, input: {}, owner: 'roger@example.test',
      action: 'duplicate', idempotencyKey: 'duplicate-skill-intent-01',
    });
    const duplicate = recordFor(storage.sql, 'skills', created.item.id);
    const card = recordFor(storage.sql, 'cards', duplicate.item.cardId);
    const audit = storage.sql.exec("SELECT * FROM audit_events WHERE action = 'duplicate'").one();

    expect(duplicate.item).toMatchObject({ name: 'Tide Shield (Copy)', classId: 'base_0', kind: 'Active', lcsNotes: 'Studio source note', mobileNotes: 'Short mobile note', tags: ['SUPPORT', 'MOBILITY'] });
    expect(duplicate.item.id).not.toBe(source.item.id);
    expect(duplicate.item.cardId).not.toBe(source.item.cardId);
    expect(card.item).toMatchObject({
      name: 'Tide Shield Foil (Copy)', type: 'Skill', element: 'Water', cost: '2', ruleText: 'Block the next strike.',
      flavourText: 'The tide holds.', artPath: 'art/tide.webp', status: 'RASCUNHO', workflowStatus: 'draft',
      source: { kind: 'skill', skillId: duplicate.item.id, classId: 'base_0', rootClassId: 'base_0' },
      sourceSnapshot: { name: duplicate.item.name, tags: ['SUPPORT', 'MOBILITY'], classId: 'base_0', rootClassId: 'base_0' },
      confirmedAt: null, confirmedRevision: null, confirmedGameplayHash: null,
      divergence: { hasPendingSourceChanges: false, fields: [] }, tags: ['BARRIER', 'Water'],
    });
    expect(card.position).toBe(6);
    expect(created.revision).toBe(13);
    expect(recordFor(storage.sql, 'skills', 'skill-source').item).toEqual(originalSkill);
    expect(recordFor(storage.sql, 'cards', 'card-source').item).toEqual(originalCard);
    expect(audit).toMatchObject({ actor: 'roger@example.test', action: 'duplicate', resource: 'skill', resource_id: duplicate.item.id });
    expect(JSON.parse(audit.details)).toMatchObject({ sourceId: 'skill-source', related: [{ resource: 'cards', id: duplicate.item.cardId, operation: 'created' }] });
  });

  it('replays one duplicate attempt without a second record or revision', () => {
    const storage = makeStorage();
    const source = recordFor(storage.sql, 'skills', 'skill-source');
    const input = { table: 'skills', id: source.item.id, expected: source.version, input: {}, owner: 'roger@example.test', action: 'duplicate', idempotencyKey: 'duplicate-skill-intent-02' };
    const first = mutateCatalog(storage, input);
    const retry = mutateCatalog(storage, input);

    expect(retry).toEqual(first);
    expect(storage.sql.exec('SELECT count(*) AS total FROM skills').one().total).toBe(2);
    expect(storage.sql.exec('SELECT count(*) AS total FROM cards').one().total).toBe(8);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
    expect(storage.sql.exec("SELECT count(*) AS total FROM audit_events WHERE action = 'duplicate'").one().total).toBe(1);
  });

  it('rejects stale source versions and reused keys without changing the vault', () => {
    const storage = makeStorage();
    const source = recordFor(storage.sql, 'skills', 'skill-source');
    const input = { table: 'skills', id: source.item.id, expected: source.version, input: {}, owner: 'roger@example.test', action: 'duplicate', idempotencyKey: 'duplicate-skill-intent-03' };
    expect(() => mutateCatalog(storage, { ...input, expected: '"stale"', idempotencyKey: 'duplicate-skill-intent-04' })).toThrow('O registro mudou');
    mutateCatalog(storage, input);
    expect(() => mutateCatalog(storage, { ...input, expected: '"different"' })).toThrow('chave de repetição já foi usada');
    expect(storage.sql.exec('SELECT count(*) AS total FROM skills').one().total).toBe(2);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
    expect(storage.sql.exec('SELECT count(*) AS total FROM audit_events').one().total).toBe(1);
  });

  it('exposes duplication only through the versioned idempotent skill route', async () => {
    const storage = makeStorage();
    const source = recordFor(storage.sql, 'skills', 'skill-source');
    const request = new Request('https://loknite.example/catalog/skills/skill-source/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': source.version, 'Idempotency-Key': 'duplicate-skill-route-01' },
      body: '{}',
    });
    const response = await handleCatalog({ request, storage, identity: { email: 'roger@example.test', admin: false }, path: ['skills', 'skill-source', 'duplicate'] });
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result).toMatchObject({ revision: 13, duplicatedFrom: 'skill-source', item: { classId: 'base_0', name: 'Tide Shield (Copy)' } });
    await expect(handleCatalog({
      request: new Request('https://loknite.example/catalog/skills/skill-source/duplicate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': source.version }, body: '{}' }),
      storage, identity: { email: 'roger@example.test', admin: false }, path: ['skills', 'skill-source', 'duplicate'],
    })).rejects.toThrow('A operação exige uma chave de repetição.');
  });

  it('moves an eligible draft within its own class root and retains its collection order', () => {
    const storage = makeStorage();
    const before = recordFor(storage.sql, 'cards', 'card-movable');
    const input = { table: 'cards', id: 'card-movable', expected: before.version, input: { destinationClassId: 'knight' }, owner: 'roger@example.test', action: 'move', idempotencyKey: 'move-card-intent-01' };
    const moved = mutateCatalog(storage, input);
    const item = recordFor(storage.sql, 'cards', 'card-movable');
    const audit = storage.sql.exec("SELECT * FROM audit_events WHERE action = 'move'").one();

    expect(item.item).toMatchObject({ name: 'Independent draft', slot: 0, layoutClassId: 'knight', status: 'RASCUNHO', ruleText: 'A short strike.' });
    expect(item.position).toBe(2);
    expect(moved.revision).toBe(13);
    expect(JSON.parse(audit.details)).toMatchObject({ from: { classId: 'base_0', tier: 'C1', rootClassId: 'base_0', slot: 0 }, to: { classId: 'knight', tier: 'C2', rootClassId: 'base_0', slot: 0 } });

    const replay = mutateCatalog(storage, input);
    expect(replay).toEqual(moved);
    const movedAgain = mutateCatalog(storage, {
      ...input, expected: item.version, input: { destinationClassId: 'berserker' }, idempotencyKey: 'move-card-intent-02',
    });
    expect(movedAgain.item.slot).toBe(1);
    expect(movedAgain.item.layoutClassId).toBe('berserker');
    expect(movedAgain.position).toBe(0);
    expect(recordFor(storage.sql, 'cards', 'card-movable').item.layoutClassId).toBe('berserker');
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(14);
  });

  it('blocks cross-root, confirmed, skill-linked, and class-mechanic moves without a revision', () => {
    const storage = makeStorage();
    for (const [id, destination, key, message] of [
      ['card-movable', 'spec', 'move-card-invalid-01', 'Escolha uma classe C1'],
      ['card-confirmed', 'knight', 'move-card-invalid-02', 'Só uma carta independente'],
      ['card-source', 'knight', 'move-card-invalid-03', 'Só uma carta independente'],
      ['card-mechanic', 'knight', 'move-card-invalid-04', 'Só uma carta independente'],
    ]) {
      const before = recordFor(storage.sql, 'cards', id);
      expect(() => mutateCatalog(storage, {
        table: 'cards', id, expected: before.version, input: { destinationClassId: destination }, owner: 'roger@example.test', action: 'move', idempotencyKey: key,
      })).toThrow(message);
    }
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(12);
    expect(storage.sql.exec("SELECT count(*) AS total FROM audit_events WHERE action = 'move'").one().total).toBe(0);
  });

  it('presents a specialization card at its parent C3 placement before moving it', () => {
    const storage = makeStorage();
    const before = recordFor(storage.sql, 'cards', 'card-spec-movable');
    const moved = mutateCatalog(storage, {
      table: 'cards', id: 'card-spec-movable', expected: before.version, input: { destinationClassId: 'rune' },
      owner: 'roger@example.test', action: 'move', idempotencyKey: 'move-spec-card-intent-01',
    });

    expect(moved.item).toMatchObject({ id: 'card-spec-movable', slot: 0, layoutClassId: 'rune' });
    expect(moved.position).toBe(5);
    expect(storage.sql.exec('SELECT revision FROM workspace WHERE id = 1').one().revision).toBe(13);
  });

  it('returns the moved record through the idempotent move route', async () => {
    const storage = makeStorage();
    const before = recordFor(storage.sql, 'cards', 'card-movable');
    const response = await handleCatalog({
      request: new Request('https://loknite.example/catalog/cards/card-movable/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': before.version, 'Idempotency-Key': 'move-card-route-01' },
        body: JSON.stringify({ destinationClassId: 'knight' }),
      }), storage, identity: { email: 'roger@example.test', admin: false }, path: ['cards', 'card-movable', 'move'],
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({ revision: 13, item: { id: 'card-movable', layoutClassId: 'knight' } });
  });
});
