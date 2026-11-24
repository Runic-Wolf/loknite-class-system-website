import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { dashboardQuery } from './dashboard-read.js';

let database;

function makeStore() {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE classes (id TEXT PRIMARY KEY, tier TEXT, slot TEXT, parent_id TEXT, name TEXT, concept TEXT, notes TEXT, position INTEGER, details TEXT);
    CREATE TABLE skills (id TEXT PRIMARY KEY, class_id TEXT, kind TEXT);
    CREATE TABLE class_tags (entity_id TEXT, tag TEXT, position INTEGER, PRIMARY KEY(entity_id, tag));
    CREATE TABLE skill_tags (entity_id TEXT, tag TEXT, position INTEGER, PRIMARY KEY(entity_id, tag));
    INSERT INTO classes VALUES
      ('base_0','C1','C1_0',NULL,'Fighter','frontline','',0,'[{},[]]'),
      ('knight','C2','C1_0/C2_0','base_0','Knight','shield path','',1,'[{},[]]'),
      ('rune','C3','C1_0/C2_0/C3_0','knight','Rune Knight','fire guardian','',2,'[{},[]]'),
      ('spec-rune','SPEC','C1_0/C2_0/C3_0/SPEC_0','rune','Rune Adept','', '',3,'[{},[]]'),
      ('base_1','C1','C1_1',NULL,'Mage','arcane','',4,'[{},[]]');
    INSERT INTO skills VALUES ('shared-skill','base_0','Passive'), ('fire-skill','rune','Active');
    INSERT INTO class_tags VALUES ('base_0','Water',0), ('base_0','C1',1), ('rune','DPS',0);
    INSERT INTO skill_tags VALUES ('shared-skill','BUFF',0), ('fire-skill','Fire',0);
  `);
  return {
    exec(query, ...params) {
      const statement = database.prepare(query);
      return { toArray: () => statement.all(...params), one: () => statement.get(...params) };
    },
  };
}

afterEach(() => { database?.close(); database = undefined; });

describe('dashboard class metrics', () => {
  it('counts unique classes, unique available skill IDs, tiers and effective tag coverage', () => {
    const dashboard = dashboardQuery(makeStore(), new URLSearchParams());
    expect(dashboard.total).toBe(5);
    expect(dashboard.counts).toEqual({ classes: 5, c3: 1, skills: 2, specializations: 1 });
    expect(dashboard.tierCounts).toEqual({ C1: 2, C2: 1, C3: 1, SPEC: 1 });
    expect(dashboard.tagCoverage.find(item => item.tag === 'Fire')).toEqual({ tag: 'Fire', classes: 2 });
    expect(dashboard.tagCoverage.find(item => item.tag === 'BUFF')).toEqual({ tag: 'BUFF', classes: 4 });
    expect(dashboard.tagCoverage.some(item => item.tag === 'C1')).toBe(false);
    expect(dashboard.classes).toHaveLength(5);
  });

  it('shares the class query rules and searches names, notes, concepts and effective tags', () => {
    const sql = makeStore();
    const where = encodeURIComponent(JSON.stringify({ logic: 'AND', source: 'effective', rules: [
      { field: 'tier', value: 'C3', enabled: true, exclude: false },
      { field: 'tag', value: 'Fire', enabled: true, exclude: false },
    ] }));
    const filtered = dashboardQuery(sql, new URLSearchParams(`where=${where}`));
    expect(filtered.classes.map(item => item.id)).toEqual(['rune']);
    expect(filtered.counts.classes).toBe(1);
    expect(filtered.counts.skills).toBe(2);

    const text = dashboardQuery(sql, new URLSearchParams('q=Fire'));
    expect(text.classes.map(item => item.id)).toEqual(['rune', 'spec-rune']);
    const concept = dashboardQuery(sql, new URLSearchParams('q=frontline'));
    expect(concept.classes.map(item => item.id)).toEqual(['base_0']);
  });

  it('applies a Dashboard drilldown inside the prior OR query without widening its class set', () => {
    const where = encodeURIComponent(JSON.stringify({
      logic: 'AND', source: 'effective',
      rules: [{ field: 'tier', value: 'C3', enabled: true, exclude: false }],
      scope: { logic: 'OR', source: 'direct', rules: [
        { field: 'name', value: 'Rune', enabled: true, exclude: false },
        { field: 'tag', value: 'Water', enabled: true, exclude: false },
      ] },
    }));
    const filtered = dashboardQuery(makeStore(), new URLSearchParams(`where=${where}`));
    expect(filtered.classes.map(item => item.id)).toEqual(['rune']);
  });

  it('returns zero-safe counts and rejects malformed query state or oversized search', () => {
    const sql = makeStore();
    const none = dashboardQuery(sql, new URLSearchParams('where=' + encodeURIComponent(JSON.stringify({ logic: 'AND', source: 'direct', rules: [
      { field: 'tag', value: 'Fire', enabled: true, exclude: false },
    ] }))));
    expect(none.counts).toEqual({ classes: 0, c3: 0, skills: 0, specializations: 0 });
    expect(none.tierCounts).toEqual({ C1: 0, C2: 0, C3: 0, SPEC: 0 });
    expect(() => dashboardQuery(sql, new URLSearchParams('where=not-json'))).toThrow('Consulta do Dashboard inválida.');
    expect(() => dashboardQuery(sql, new URLSearchParams('q=' + 'x'.repeat(121)))).toThrow('até 120 caracteres');
  });
});
