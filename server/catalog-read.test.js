import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { listRecords } from './catalog-read.js';
import { exportCatalogCsv } from './catalog-export.js';
import { applyTestMigrations } from './test-database.js';

let database;

function makeStore() {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE classes (id TEXT PRIMARY KEY, tier TEXT, slot TEXT, parent_id TEXT, name TEXT, concept TEXT, position INTEGER, details TEXT);
    CREATE TABLE skills (id TEXT PRIMARY KEY, class_id TEXT, card_id TEXT, name TEXT, kind TEXT, position INTEGER, details TEXT);
    CREATE TABLE class_tags (entity_id TEXT, tag TEXT, position INTEGER, PRIMARY KEY(entity_id, tag));
    CREATE TABLE skill_tags (entity_id TEXT, tag TEXT, position INTEGER, PRIMARY KEY(entity_id, tag));
    CREATE TABLE cards (
      id TEXT PRIMARY KEY, skill_id TEXT, owner_id TEXT, category TEXT, slot INTEGER, name TEXT,
      type TEXT, element TEXT, cost TEXT, rule_text TEXT, flavour_text TEXT, status TEXT,
      workflow_status TEXT, art_path TEXT, position INTEGER, details TEXT,
      name_font_size INTEGER DEFAULT 17, type_font_size INTEGER DEFAULT 6, element_font_size INTEGER DEFAULT 6,
      rule_font_size INTEGER DEFAULT 10, flavour_font_size INTEGER DEFAULT 7,
      rule_text_offset_y INTEGER DEFAULT 0, flavour_text_offset_y INTEGER DEFAULT 0,
      art_zoom_percent INTEGER DEFAULT 100, art_offset_x_percent INTEGER DEFAULT 0, art_offset_y_percent INTEGER DEFAULT 0,
      visual_profile TEXT
    );
    CREATE TABLE card_tags (entity_id TEXT, tag TEXT, position INTEGER, PRIMARY KEY(entity_id, tag));
    CREATE VIRTUAL TABLE cards_search USING fts5(name, body);
    INSERT INTO classes(id, tier, slot, parent_id, name, concept, position, details) VALUES
      ('base_0', 'C1', 'C1_0', NULL, 'Fighter', '', 0, '[{},[]]'),
      ('knight', 'C2', 'C1_0/C2_0', 'base_0', 'Knight', '', 24, '[{},[]]'),
      ('rune', 'C3', 'C1_0/C2_0/C3_0', 'knight', 'Rune Knight', '', 28, '[{},[]]'),
      ('spec-rune', 'SPEC', 'C1_0/C2_0/C3_0/SPEC_0', 'rune', 'Rune Adept', '', 29, '[{},[]]'),
      ('base_1', 'C1', 'C1_1', NULL, 'Barbarian', '', 1, '[{"favorite":true},[]]');
    INSERT INTO skills(id, class_id, card_id, name, kind, position, details) VALUES
      ('skill-rune', 'rune', 'card-skill', 'Rune Skill', 'Active', 0, '[{},[]]');
    INSERT INTO class_tags(entity_id, tag, position) VALUES
      ('base_0', 'Water', 0), ('base_0', 'C1', 1), ('rune', 'DPS', 0);
    INSERT INTO skill_tags(entity_id, tag, position) VALUES
      ('skill-rune', 'Fire', 0), ('skill-rune', 'C3', 1);
  `);

  const rows = [
    ['root-attack', 'base_0', null, 0, 'Root Attack', 'Attack', 'Fire', '1', 'Burning strike', ''],
    ['root-mechanic', 'base_0', null, 0, 'Root Mechanic', 'Class Mechanic', 'Arcane', 'X', 'Special mechanic', ''],
    ['child-power', 'knight', null, 0, 'Knight Power', 'Power', 'Arcane', '0', 'Shielded', ''],
    ['skill-rune', null, 'skill-rune', 0, 'Rune Skill Card', 'Skill', 'Fire', '2', 'Rune guard', ''],
    ['legacy-slot', null, null, 0, 'Legacy Root Card', 'Skill', 'Fire', '3', 'Old slot entry', ''],
    ['other-family', 'base_1', null, 1, 'Other Family', 'Attack', 'Fire', '1', 'Outside this root', ''],
    ['independent', null, null, 3, 'Independent Equipment', 'Other', 'Neutral', '1', 'Pack', ''],
  ];
  const insert = database.prepare(`INSERT INTO cards(rowid, id, owner_id, skill_id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, art_path, position, details)
    VALUES (?, ?, ?, ?, 'class', ?, ?, ?, ?, ?, ?, ?, 'RASCUNHO', 'draft', NULL, 0, ?)`);
  const search = database.prepare('INSERT INTO cards_search(rowid, name, body) VALUES (?, ?, ?)');
  rows.forEach((row, index) => {
    insert.run(index + 1, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], '[{},[]]');
    search.run(index + 1, row[4], row[8] + ' ' + row[9]);
  });
  database.prepare("INSERT INTO card_tags(entity_id, tag, position) VALUES ('root-attack', 'INT', 0)").run();
  database.prepare("INSERT INTO card_tags(entity_id, tag, position) VALUES ('root-attack', 'DPS', 1)").run();
  database.prepare("INSERT INTO card_tags(entity_id, tag, position) VALUES ('root-mechanic', 'TANK', 0)").run();
  database.prepare(`INSERT INTO cards(id, category, slot, name, type, element, cost, rule_text, flavour_text, status, workflow_status, position, details)
    VALUES ('enemy-slot-four', 'enemy', 4, 'Zulu enemy', 'Attack', 'Fire', '1', 'Claw', '', 'RASCUNHO', 'draft', 0, '[{},[]]'),
      ('enemy-slot-four-next', 'enemy', 4, 'Alpha enemy', 'Attack', 'Fire', '1', 'Bite', '', 'RASCUNHO', 'draft', 1, '[{},[]]')`).run();

  return {
    exec(query, ...params) {
      const statement = database.prepare(query);
      return { toArray: () => statement.all(...params), one: () => statement.get(...params) };
    }
  };
}

function params(query) {
  return new URLSearchParams(query);
}

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('class card collection queries', () => {
  it('executes the Gallery card projection against the current migrated schema', () => {
    database = new DatabaseSync(':memory:');
    applyTestMigrations(database);
    const sql = {
      exec(query, ...params) {
        const statement = database.prepare(query);
        return { toArray: () => statement.all(...params), one: () => statement.get(...params) };
      }
    };

    expect(listRecords(sql, 'cards', params('category=class&limit=10'))).toEqual({ items: [], next: null });
  });

  it('keeps exact C1 compatibility, exact child scope and whole-family scope distinct', () => {
    const sql = makeStore();
    const exactRoot = listRecords(sql, 'cards', params('category=class&classId=base_0&family=C1_0&limit=50'));
    const exactC2 = listRecords(sql, 'cards', params('category=class&classId=knight&family=C1_0&limit=50'));
    const family = listRecords(sql, 'cards', params('category=class&family=C1_0&limit=50'));

    expect(exactRoot.items.map(item => item.id)).toContain('legacy-slot');
    expect(exactRoot.items.map(item => item.id)).toContain('root-attack');
    expect(exactRoot.items.map(item => item.id)).not.toContain('child-power');
    expect(exactC2.items.map(item => item.id)).toEqual(['child-power']);
    expect(family.items.map(item => item.id)).toContain('legacy-slot');
    expect(family.items.map(item => item.id)).toContain('skill-rune');
    expect(family.items.map(item => item.id)).not.toContain('other-family');
    expect(family.items.map(item => item.id)).not.toContain('independent');
  });

  it('orders the editorial class path before type, cost, name and ID pagination', () => {
    const sql = makeStore();
    const first = listRecords(sql, 'cards', params('category=class&family=C1_0&limit=2'));
    const second = listRecords(sql, 'cards', params('category=class&family=C1_0&limit=2&after=' + first.next));

    expect(first.items.map(item => item.id)).toEqual(['root-mechanic', 'root-attack']);
    expect(second.items.map(item => item.id)).toEqual(['legacy-slot', 'child-power']);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(4);
  });

  it('matches full text, type, element and tag while applying multi-value filters as OR', () => {
    const sql = makeStore();
    const search = listRecords(sql, 'cards', params('category=class&family=C1_0&q=Attack&limit=50'));
    const tag = listRecords(sql, 'cards', params('category=class&family=C1_0&q=INT&limit=50'));
    const filters = listRecords(sql, 'cards', params('category=class&family=C1_0&type=Attack&type=Power&cost=0&cost=1&element=Arcane&element=Fire&limit=50'));

    expect(search.items.map(item => item.id)).toEqual(['root-attack']);
    expect(tag.items.map(item => item.id)).toEqual(['root-attack']);
    expect(filters.items.map(item => item.id)).toEqual(['root-attack', 'child-power']);
  });

  it('scopes non-class categories to one of the fifteen persisted group slots', () => {
    const sql = makeStore();
    const first = listRecords(sql, 'cards', params('category=enemy&group=4&limit=1'));
    const second = listRecords(sql, 'cards', params('category=enemy&group=4&limit=1&after=' + first.next));
    expect(first.items.map(item => item.id)).toEqual(['enemy-slot-four']);
    expect(second.items.map(item => item.id)).toEqual(['enemy-slot-four-next']);
    expect(first.next).toBeTruthy();
    expect(() => listRecords(sql, 'cards', params('category=enemy&group=15'))).toThrow('Grupo de coleção inválido.');
    expect(() => listRecords(sql, 'cards', params('category=class&group=4'))).toThrow('Grupo de coleção inválido.');
  });

  it('derives C-Tier from linked classes and requires every selected role tag', () => {
    const sql = makeStore();
    const roots = listRecords(sql, 'cards', params('category=class&family=C1_0&tier=C1&limit=50'));
    const c2 = listRecords(sql, 'cards', params('category=class&family=C1_0&tier=C2&limit=50'));
    const allRoles = listRecords(sql, 'cards', params('category=class&family=C1_0&tag=INT&tag=DPS&limit=50'));
    const mixedRoles = listRecords(sql, 'cards', params('category=class&family=C1_0&tag=INT&tag=TANK&limit=50'));
    expect(roots.items.map(item => item.id)).toEqual(['root-mechanic', 'root-attack', 'legacy-slot']);
    expect(c2.items.map(item => item.id)).toEqual(['child-power']);
    expect(allRoles.items.map(item => item.id)).toEqual(['root-attack']);
    expect(mixedRoles.items).toHaveLength(0);
    expect(() => listRecords(sql, 'cards', params('category=enemy&tier=C1'))).toThrow('Filtro C-Tier inválido.');
  });
});

describe('catalog CSV export', () => {
  it('exports the complete filtered and sorted result, ignoring the visible page cursor and size', async () => {
    const sql = makeStore();
    const response = exportCatalogCsv(sql, 'cards', params(
      'category=class&family=C1_0&sort=name&dir=asc&after=not-a-real-cursor&limit=1&column=name',
    ), { now: new Date('2026-11-23T12:00:00.000Z') });
    const csv = await response.text();

    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="loknite-cards-2026-11-23.csv"');
    expect(csv.startsWith('"Card"\r\n')).toBe(true);
    expect(csv).toContain('"Knight Power"\r\n"Legacy Root Card"\r\n"Root Attack"\r\n"Root Mechanic"\r\n');
    expect(csv).not.toContain('Other Family');
  });

  it('rejects unknown export filters before querying the catalog', () => {
    expect(() => exportCatalogCsv(null, 'cards', params('unreviewed=anything'))).toThrow('Filtro de exportação indisponível');
  });
});

describe('class tag provenance filters', () => {
  it('matches effective local and ancestor skill tags without inheriting class tags downward', () => {
    const sql = makeStore();
    const inheritedSkillTag = listRecords(sql, 'classes', params('tag=Fire&tagSource=effective&limit=50'));
    const defaultSource = listRecords(sql, 'classes', params('tag=Fire&limit=50'));
    const directSkillTag = listRecords(sql, 'classes', params('tag=Fire&tagSource=direct&limit=50'));
    const directClassTag = listRecords(sql, 'classes', params('tag=Water&tagSource=direct&limit=50'));
    const effectiveClassTag = listRecords(sql, 'classes', params('tag=Water&tagSource=effective&limit=50'));

    expect(new Set(inheritedSkillTag.items.map(item => item.id))).toEqual(new Set(['rune', 'spec-rune']));
    expect(defaultSource.items.map(item => item.id)).toEqual(inheritedSkillTag.items.map(item => item.id));
    expect(directSkillTag.items).toHaveLength(0);
    expect(directClassTag.items.map(item => item.id)).toEqual(['base_0']);
    expect(effectiveClassTag.items.map(item => item.id)).toEqual(['base_0']);
  });

  it('requires every effective tag and excludes structural tier values', () => {
    const sql = makeStore();
    const combined = listRecords(sql, 'classes', params('tag=Fire&tag=DPS&tagSource=effective&limit=50'));
    const structural = listRecords(sql, 'classes', params('tag=C1&tagSource=effective&limit=50'));

    expect(combined.items.map(item => item.id)).toEqual(['rune']);
    expect(structural.items).toHaveLength(0);
  });

  it('rejects invalid tag sources and effective filtering on non-class records', () => {
    const sql = makeStore();
    expect(() => listRecords(sql, 'classes', params('tag=Fire&tagSource=magic'))).toThrow('Origem das tags inválida.');
    expect(() => listRecords(sql, 'cards', params('tag=INT&tagSource=effective'))).toThrow('Tags efetivas só podem ser consultadas em classes.');
  });
});

describe('structured class queries', () => {
  it('combines rules with AND/OR and applies NOT to one rule', () => {
    const sql = makeStore();
    const query = (rules, source = 'direct') => encodeURIComponent(JSON.stringify({ logic: 'OR', source, rules }));
    const any = listRecords(sql, 'classes', params(`where=${query([
      { field: 'tier', value: 'C2' }, { field: 'tag', value: 'Water' },
    ])}&limit=50`));
    const notFire = listRecords(sql, 'classes', params(`where=${query([
      { field: 'tag', value: 'Fire', exclude: true },
    ], 'effective')}&limit=50`));
    const all = listRecords(sql, 'classes', params(`where=${encodeURIComponent(JSON.stringify({ logic: 'AND', source: 'effective', rules: [
      { field: 'tier', value: 'C3' }, { field: 'tag', value: 'Fire' },
    ] }))}&limit=50`));

    expect(new Set(any.items.map(item => item.id))).toEqual(new Set(['base_0', 'knight']));
    expect(new Set(notFire.items.map(item => item.id))).toEqual(new Set(['base_0', 'base_1', 'knight']));
    expect(all.items.map(item => item.id)).toEqual(['rune']);
  });

  it('keeps a Dashboard drilldown constrained by its previous OR scope', () => {
    const sql = makeStore();
    const query = encodeURIComponent(JSON.stringify({
      logic: 'AND', source: 'effective', rules: [{ field: 'tier', value: 'C3' }],
      scope: { logic: 'OR', source: 'direct', rules: [
        { field: 'name', value: 'Rune' }, { field: 'tag', value: 'Water' },
      ] },
    }));
    const result = listRecords(sql, 'classes', params(`where=${query}&limit=50`));
    expect(result.items.map(item => item.id)).toEqual(['rune']);
  });

  it('matches inherited skill rules, names and favorites on the owning class', () => {
    const sql = makeStore();
    const query = (field, value) => encodeURIComponent(JSON.stringify({ logic: 'AND', source: 'effective', rules: [{ field, value }] }));
    const kind = listRecords(sql, 'classes', params(`where=${query('kind', 'Active')}&limit=50`));
    const available = listRecords(sql, 'classes', params(`where=${query('hasSkills', 'yes')}&limit=50`));
    const favorite = listRecords(sql, 'classes', params(`where=${query('favorite', 'yes')}&limit=50`));
    const name = listRecords(sql, 'classes', params(`where=${query('name', 'Rune')}&limit=50`));
    const matchingSkill = listRecords(sql, 'skills', params(`where=${query('kind', 'Active')}&limit=50`));

    expect(new Set(kind.items.map(item => item.id))).toEqual(new Set(['rune', 'spec-rune']));
    expect(new Set(available.items.map(item => item.id))).toEqual(new Set(['rune', 'spec-rune']));
    expect(favorite.items.map(item => item.id)).toEqual(['base_1']);
    expect(new Set(name.items.map(item => item.id))).toEqual(new Set(['rune', 'spec-rune']));
    expect(matchingSkill.items.map(item => item.id)).toEqual(['skill-rune']);
  });

  it('ignores disabled rules, rejects unsafe fields, and keeps class filters off other entities', () => {
    const sql = makeStore();
    const disabled = listRecords(sql, 'classes', params(`where=${encodeURIComponent(JSON.stringify({ logic: 'AND', source: 'direct', rules: [
      { field: 'tier', value: 'C3', enabled: false },
    ] }))}&limit=50`));
    expect(disabled.items).toHaveLength(5);
    expect(() => listRecords(sql, 'classes', params(`where=${encodeURIComponent(JSON.stringify({ logic: 'OR', rules: [{ field: 'details); DROP TABLE classes;--', value: 'x' }] }))}`))).toThrow('Consulta de classes inválida.');
    expect(() => listRecords(sql, 'cards', params('where=%7B%22rules%22%3A%5B%5D%7D'))).toThrow('Consulta de classes indisponível');
    expect(listRecords(sql, 'classes', params('tag=C1&tagSource=direct')).items).toHaveLength(0);
  });
});

describe('database sorting and cursor pagination', () => {
  it('sorts a whitelist field in descending order and advances without repeating rows', () => {
    const sql = makeStore();
    const first = listRecords(sql, 'classes', params('sort=name&dir=desc&limit=2'));
    const second = listRecords(sql, 'classes', params(`sort=name&dir=desc&limit=2&after=${first.next}`));

    expect(first.items.map(item => item.name)).toEqual(['Rune Knight', 'Rune Adept']);
    expect(second.items.map(item => item.name)).toEqual(['Knight', 'Fighter']);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(4);
    expect(first.next).toBeTruthy();
  });

  it('sorts class paths by numeric progression segments instead of their text spelling', () => {
    const sql = makeStore();
    const page = listRecords(sql, 'classes', params('sort=slot&dir=asc&limit=50'));
    expect(page.items.map(item => item.id)).toEqual(['base_0', 'knight', 'rune', 'spec-rune', 'base_1']);

    const first = listRecords(sql, 'classes', params('sort=slot&dir=asc&limit=2'));
    const second = listRecords(sql, 'classes', params(`sort=slot&dir=asc&limit=2&after=${first.next}`));
    expect(first.items.map(item => item.id)).toEqual(['base_0', 'knight']);
    expect(second.items.map(item => item.id)).toEqual(['rune', 'spec-rune']);
  });

  it('uses numeric cost order with stable ID ties and a matching next cursor', () => {
    const sql = makeStore();
    database.prepare(`INSERT INTO cards(id, owner_id, category, slot, name, type, element, cost, rule_text, status, workflow_status, position, details)
      VALUES ('duplicate-cost', 'base_0', 'class', 0, 'Additional Attack', 'Attack', 'Fire', '1', 'Strike', 'RASCUNHO', 'draft', 1, '[{},[]]')`).run();
    const first = listRecords(sql, 'cards', params('sort=cost&dir=asc&category=class&family=C1_0&limit=2'));
    const second = listRecords(sql, 'cards', params(`sort=cost&dir=asc&category=class&family=C1_0&limit=2&after=${first.next}`));

    expect(first.items.map(item => item.id)).toEqual(['child-power', 'duplicate-cost']);
    expect(second.items.map(item => item.id)).toEqual(['root-attack', 'skill-rune']);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(4);
  });

  it('rejects unknown fields, invalid directions and malformed cursors', () => {
    const sql = makeStore();
    expect(() => listRecords(sql, 'classes', params('sort=name;DROP%20TABLE%20classes'))).toThrow('Ordenação inválida.');
    expect(() => listRecords(sql, 'classes', params('sort=name&dir=sideways'))).toThrow('Ordenação inválida.');
    const malformed = Buffer.from(JSON.stringify(['not-a-number', 'base_0'])).toString('base64url');
    expect(() => listRecords(sql, 'cards', params(`sort=cost&after=${malformed}`))).toThrow('Página inválida.');
  });
});
