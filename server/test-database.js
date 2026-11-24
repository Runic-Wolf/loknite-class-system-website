import { readdirSync, readFileSync } from 'node:fs';

const migrationsDirectory = new URL('../migrations/', import.meta.url);

export function applyTestMigrations(database) {
  database.exec('PRAGMA foreign_keys = ON');
  const migrations = readdirSync(migrationsDirectory)
    .filter(file => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  if (!migrations.length) throw new Error('No numbered database migrations were found.');
  for (const [index, file] of migrations.entries()) {
    const version = Number(file.slice(0, 4));
    if (version !== index + 1) throw new Error(`Database migration sequence is incomplete at ${version}.`);
    database.exec(readFileSync(new URL(file, migrationsDirectory), 'utf8'));
  }
}
