import workspace from '../migrations/0001_workspace.sql';
import objects from '../migrations/0002_objects.sql';

const migrations = [workspace, objects];
const chunkSize = 512 * 1024;

export function migrate(storage) {
  const { sql } = storage;
  storage.transactionSync(() => {
    sql.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY) STRICT');
    const { version } = sql.exec('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').one();
    if (version > migrations.length) throw new Error('Esta versão do app não suporta o schema do Vault.');
    for (let index = version; index < migrations.length; index++) {
      sql.exec(migrations[index]);
      sql.exec('INSERT INTO schema_migrations VALUES (?)', index + 1);
    }
  });
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
