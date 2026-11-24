import workspace from '../migrations/0001_workspace.sql';
import objects from '../migrations/0002_objects.sql';

import catalog from '../migrations/0003_catalog.sql';
import audit from '../migrations/0004_audit.sql';
import enumGuards from '../migrations/0005_enum_guards.sql';
import queryIndexes from '../migrations/0006_query_indexes.sql';
import mutationIdempotency from '../migrations/0007_mutation_idempotency.sql';
import cardCollectionPositions from '../migrations/0008_card_collection_positions.sql';
import classIdempotencyResource from '../migrations/0009_idempotency_class_resource.sql';
import mentionLookup from '../migrations/0010_mention_lookup.sql';
import cardVisualSettings from '../migrations/0011_card_visual_settings.sql';
import cardArtworkFraming from '../migrations/0012_card_artwork_framing.sql';
import cardLayoutProfile from '../migrations/0013_card_layout_profile.sql';
import cardMaterialMasks from '../migrations/0014_card_material_masks.sql';
import cardParallaxLayers from '../migrations/0015_card_parallax_layers.sql';
import { normalizeMentionKey } from '../shared/class-mentions.js';

const migrations = [workspace, objects, catalog, audit, enumGuards, queryIndexes, mutationIdempotency, cardCollectionPositions, classIdempotencyResource, mentionLookup, cardVisualSettings, cardArtworkFraming, cardLayoutProfile, cardMaterialMasks, cardParallaxLayers];
const chunkSize = 512 * 1024;

export function migrate(storage) {
  const { sql } = storage;
  storage.transactionSync(() => {
    sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY) STRICT');
    const { version } = sql.exec('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').one();
    if (version > migrations.length) throw new Error('Esta versão do app não suporta o schema do Vault.');
    for (let index = version; index < migrations.length; index++) {
      sql.exec(migrations[index]);
      if (index === 9) backfillMentionKeys(sql);
      sql.exec('INSERT INTO schema_migrations VALUES (?)', index + 1);
    }
  });
}

function backfillMentionKeys(sql) {
  // Durable Objects SQLite has a 100-variable limit. Each row binds two CASE
  // values plus its id in the IN clause, so keep batches well below 33 rows.
  const batchSize = 30;
  for (const table of ['classes', 'skills', 'cards']) {
    const records = sql.exec(`SELECT id, name FROM ${table} ORDER BY id`).toArray();
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const batch = records.slice(offset, offset + batchSize);
      if (!batch.length) continue;
      const cases = batch.map(() => 'WHEN ? THEN ?').join(' ');
      const placeholders = batch.map(() => '?').join(', ');
      const bindings = batch.flatMap(row => [row.id, normalizeMentionKey(row.name)]);
      bindings.push(...batch.map(row => row.id));
      sql.exec(`UPDATE ${table} SET mention_key = CASE id ${cases} ELSE mention_key END WHERE id IN (${placeholders})`, ...bindings);
    }
  }
  sql.exec('CREATE INDEX classes_mention_idx ON classes(mention_key, tier) WHERE mention_key <> \'\'');
  sql.exec('CREATE INDEX skills_mention_idx ON skills(mention_key) WHERE mention_key <> \'\'');
  sql.exec(`CREATE INDEX cards_mention_idx ON cards(mention_key) WHERE mention_key <> ''`);
  sql.exec(`CREATE INDEX cards_note_mention_idx
    ON cards(json_extract(details, '$[0].noteOwnerId'), json_extract(details, '$[0].noteTier'), mention_key)
    WHERE json_extract(details, '$[0].noteOwnerId') IS NOT NULL AND mention_key <> ''`);
}

export function createDatabase(storage) {
  const { sql } = storage;
  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    first: async () => sql.exec(query, ...args).toArray()[0] ?? null,
    all: async () => ({ results: sql.exec(query, ...args).toArray() }),
    run: async () => execute(query, args),
    execute: () => execute(query, args)
  });
  function execute(query, args) {
    const cursor = sql.exec(query, ...args);
    return { results: cursor.toArray(), meta: { changes: cursor.rowsWritten } };
  }
  return {
    prepare: statement,
    batch: async statements => storage.transactionSync(() => statements.map(item => item.execute()))
  };
}

export function createObjectStore(storage) {
  const { sql } = storage;
  return {
    async put(key, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      storage.transactionSync(() => {
        if (sql.exec('SELECT 1 FROM objects WHERE key = ?', key).toArray().length) return;
        sql.exec('INSERT INTO objects (key, size) VALUES (?, ?)', key, bytes.byteLength);
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
          const end = Math.min(offset + chunkSize, bytes.byteLength);
          const arrayBuffer = bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + end);
          sql.exec('INSERT INTO object_chunks VALUES (?, ?, ?)', key, offset / chunkSize, arrayBuffer);
        }
      });
    },

    async get(key) {
      const record = sql.exec('SELECT size FROM objects WHERE key = ?', key).toArray()[0];
      if (!record) return null;
      let position = 0;
      const body = new ReadableStream({
        pull(controller) {
          if (position * chunkSize >= record.size) {
            controller.close();
            return;
          }
          const { body } = sql.exec('SELECT body FROM object_chunks WHERE key = ? AND position = ?', key, position++).one();
          controller.enqueue(new Uint8Array(body));
        }
      });
      return { body, json: () => new Response(body).json() };
    }
  };
}
