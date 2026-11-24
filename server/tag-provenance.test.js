import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { handleCatalog } from './catalog-api.js';
import { applyTestMigrations } from './test-database.js';

let database;

function makeStorage() {
  database = new DatabaseSync(':memory:');
  applyTestMigrations(database);
  database.prepare('INSERT INTO workspace (id, vault_id, revision, transaction_id, updated_at) VALUES (1, ?, ?, ?, ?)')
    .run('vault-test', 1, 'tx-seed', '2026-11-23T00:00:00.000Z');

  const addClass = database.prepare('INSERT INTO classes (id, tier, parent_id, slot, name, concept, notes, image_path, position, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  addClass.run('base_0', 'C1', null, 'C1_0', 'Fighter', '', '', null, 0, '[{},[]]');
  addClass.run('knight', 'C2', 'base_0', 'C1_0/C2_0', 'Knight', '', '', null, 1, '[{},[]]');
  addClass.run('rune', 'C3', 'knight', 'C1_0/C2_0/C3_0', 'Rune Knight', '', '', null, 2, '[{},[]]');
  const addCard = database.prepare(`INSERT INTO cards (id, skill_id, owner_id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, art_path, position, details)
    VALUES (?, NULL, NULL, 'class', 0, ?, 'Attack', 'Fire', '1', '', '', 'RASCUNHO', 'draft', NULL, 0, '[{},[]]')`);
  addCard.run('card-root', 'Root Skill Card');
  addCard.run('card-branch', 'Branch Skill Card');
  addCard.run('card-local', 'Local Skill Card');
  const addSkill = database.prepare('INSERT INTO skills (id, class_id, card_id, name, kind, position, details) VALUES (?, ?, ?, ?, ?, ?, ?)');
  addSkill.run('skill-root', 'base_0', 'card-root', 'Root Skill', 'Active', 0, '[{},[]]');
  addSkill.run('skill-branch', 'knight', 'card-branch', 'Shield Skill', 'Passive', 0, '[{},[]]');
  addSkill.run('skill-local', 'rune', 'card-local', 'Rune Skill', 'Ultimate', 0, '[{},[]]');

  const addClassTag = database.prepare('INSERT INTO class_tags (entity_id, tag, position) VALUES (?, ?, ?)');
  addClassTag.run('base_0', 'C1', 0);
  addClassTag.run('base_0', 'INT', 1);
  addClassTag.run('knight', 'TANK', 0);
  addClassTag.run('rune', 'C3', 0);
  addClassTag.run('rune', 'FIRE', 1);
  const addSkillTag = database.prepare('INSERT INTO skill_tags (entity_id, tag, position) VALUES (?, ?, ?)');
  addSkillTag.run('skill-root', 'FIRE', 0);
  addSkillTag.run('skill-root', 'HEAL', 1);
  addSkillTag.run('skill-branch', 'BUFF', 0);
  addSkillTag.run('skill-branch', 'HEAL', 1);
  addSkillTag.run('skill-local', 'FIRE', 0);
  addSkillTag.run('skill-local', 'BUFF', 1);

  const sql = {
    exec(query, ...params) {
      const statement = database.prepare(query);
      const rows = statement.all(...params);
      return { toArray: () => rows, one: () => rows[0] };
    },
  };
  return { sql };
}

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('class tag provenance', () => {
  it('separates class tags from skills, and local skills from inherited ancestor skills', async () => {
    const storage = makeStorage();
    const response = await handleCatalog({
      request: new Request('https://loknite.example/catalog/classes/rune/tag-provenance'),
      storage,
      identity: { email: 'bruno@example.test', admin: true },
      path: ['classes', 'rune', 'tag-provenance'],
    });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.lineage.map(item => item.id)).toEqual(['base_0', 'knight', 'rune']);
    expect(result.tags.map(item => item.value)).toEqual(['FIRE', 'HEAL', 'BUFF']);
    expect(result.tags.find(item => item.value === 'FIRE')).toMatchObject({
      occurrenceCount: 3, directOnClass: true, fromOwnSkills: true, fromAncestorSkills: true,
    });
    expect(result.tags.find(item => item.value === 'HEAL')).toMatchObject({
      occurrenceCount: 2, directOnClass: false, fromOwnSkills: false, fromAncestorSkills: true,
    });
    expect(result.tags.find(item => item.value === 'BUFF')).toMatchObject({
      occurrenceCount: 2, directOnClass: false, fromOwnSkills: true, fromAncestorSkills: true,
    });
    expect(result.tags.flatMap(item => item.sources).map(item => item.recordName)).toContain('Root Skill');
    expect(result.tags.map(item => item.value)).not.toContain('INT');
    expect(result.tags.map(item => item.value)).not.toContain('TANK');
    expect(result.tags.map(item => item.value)).not.toContain('C3');
    expect(result.counts).toEqual({ effective: 3, directOnClass: 1, ownSkills: 2, inheritedSkills: 3 });
  });

  it('returns a not-found response for classes that do not exist', async () => {
    const storage = makeStorage();
    await expect(handleCatalog({
      request: new Request('https://loknite.example/catalog/classes/missing/tag-provenance'),
      storage,
      identity: { email: 'bruno@example.test', admin: true },
      path: ['classes', 'missing', 'tag-provenance'],
    })).rejects.toMatchObject({ status: 404 });
  });
});
