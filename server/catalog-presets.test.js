import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { codecs, decode } from './records.js';
import { handleCatalogPresets } from './catalog-presets.js';

let database;

function makeStorage() {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE presets (id TEXT PRIMARY KEY, position INTEGER NOT NULL, details TEXT NOT NULL CHECK (json_valid(details))) STRICT;
    CREATE TABLE workspace (id INTEGER PRIMARY KEY, vault_id TEXT NOT NULL, revision INTEGER NOT NULL, transaction_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE vault_revisions (revision INTEGER PRIMARY KEY, transaction_id TEXT NOT NULL, updated_at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL);
    CREATE TABLE audit_events (event_id TEXT PRIMARY KEY, revision INTEGER, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT, resource_id TEXT, resource_name TEXT, changed_fields TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
    INSERT INTO workspace VALUES (1, 'vault-test', 4, 'tx-4', '2026-11-23T00:00:00.000Z');
  `);
  return {
    sql: { exec(query, ...params) {
      const statement = database.prepare(query);
      if (!/^\s*(SELECT|WITH)\b/i.test(query)) statement.run(...params);
      return { toArray: () => statement.all(...params), one: () => statement.get(...params) };
    } },
    transactionSync(callback) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = callback();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

function request(method, id, body, version) {
  const headers = new Headers();
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (version) headers.set('If-Match', version);
  return new Request(`https://lcs.test/api/v1/catalog/presets${id ? `/${id}` : ''}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function call(storage, httpRequest) {
  const segments = new URL(httpRequest.url).pathname.split('/');
  const id = segments.at(-1) === 'presets' ? undefined : segments.at(-1);
  try { return await handleCatalogPresets({ request: httpRequest, storage, actor: 'bruno@example.test', id }); }
  catch (error) { return Response.json({ error: error.message }, { status: error.status ?? 500 }); }
}

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('shared catalog query presets', () => {
  it('stores desktop-compatible filters and audits create/update/delete revisions', async () => {
    const storage = makeStorage();
    const query = { logic: 'OR', source: 'direct', rules: [{ field: 'tier', value: 'C2', enabled: true, exclude: false }] };
    const created = await call(storage, request('POST', undefined, { id: 'preset-one', name: 'Front line', query }));
    const payload = await created.json();
    expect(created.status, JSON.stringify(payload)).toBe(201);
    expect(payload.item).toMatchObject({ id: 'preset-one', name: 'Front line', query, position: 0 });
    expect(payload.revision).toBe(5);

    const codec = codecs().find(item => item.table === 'presets');
    const stored = decode(database.prepare('SELECT * FROM presets WHERE id = ?').get('preset-one'), codec);
    expect(stored).toMatchObject({ op: 'OR', source: 'direct', filters: [{ field: 'tier', value: 'C2', enabled: true, exclude: false }] });

    const listed = await call(storage, request('GET'));
    expect((await listed.json()).items).toEqual([expect.objectContaining({ id: 'preset-one', query })]);

    const updatedQuery = { ...query, rules: [{ field: 'tier', value: 'C3', enabled: true, exclude: true }] };
    const updated = await call(storage, request('PATCH', 'preset-one', { name: 'Back line', query: updatedQuery }, payload.version));
    const updatedPayload = await updated.json();
    expect(updated.status).toBe(200);
    expect(updatedPayload.item).toMatchObject({ name: 'Back line', query: updatedQuery });
    expect(updatedPayload.revision).toBe(6);

    const stale = await call(storage, request('DELETE', 'preset-one', undefined, payload.version));
    expect(stale.status).toBe(409);
    const deleted = await call(storage, request('DELETE', 'preset-one', undefined, updatedPayload.version));
    expect(deleted.status).toBe(200);
    expect(database.prepare('SELECT count(*) AS total FROM presets').get().total).toBe(0);
    expect(database.prepare('SELECT count(*) AS total FROM audit_events').get().total).toBe(3);
    expect(database.prepare('SELECT revision FROM workspace WHERE id = 1').get().revision).toBe(7);
  });

  it('makes a retried create with the same ID idempotent and rejects invalid query fields', async () => {
    const storage = makeStorage();
    const body = { id: 'preset-retry', name: 'No skills', query: { logic: 'AND', source: 'effective', rules: [{ field: 'hasSkills', value: 'no' }] } };
    const created = await call(storage, request('POST', undefined, body));
    const first = await created.json();
    const repeated = await call(storage, request('POST', undefined, body));
    const second = await repeated.json();
    expect(repeated.status, JSON.stringify(second)).toBe(200);
    expect(second.version).toBe(first.version);
    expect(second.revision).toBe(5);
    expect(database.prepare('SELECT count(*) AS total FROM presets').get().total).toBe(1);
    expect(database.prepare('SELECT count(*) AS total FROM audit_events').get().total).toBe(1);

    const invalid = await call(storage, request('POST', undefined, { ...body, id: 'preset-invalid', query: { logic: 'AND', source: 'effective', rules: [{ field: 'raw SQL', value: 'DROP' }] } }));
    expect(invalid.status).toBe(422);
  });
});
