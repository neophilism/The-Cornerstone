import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

export type MigrationSource = Readonly<{ name: string; sql: string; sha256: string }>;
export type AppliedMigration = Readonly<{ name: string; sha256: string }>;
const filename = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function loadMigrations(directory = 'db'): Promise<MigrationSource[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    names.map(async (name) => {
      if (!filename.test(name)) throw Error(`Invalid migration filename: ${name}`);
      const sql = await readFile(join(directory, name), 'utf8');
      return { name, sql, sha256: hash(sql) };
    }),
  );
}

/** Validate the entire source and applied prefix before executing any migration. */
export function planMigrations(
  sources: readonly MigrationSource[],
  applied: readonly AppliedMigration[],
) {
  if (!sources.length) throw Error('No migration sources found.');
  const ordered = [...sources].sort((a, b) => a.name.localeCompare(b.name));
  for (const [index, source] of ordered.entries()) {
    const match = filename.exec(source.name);
    if (!match || Number(match[1]) !== index + 1)
      throw Error('Migration sources must have unique, contiguous versions starting at 001.');
    if (!source.sql.trim() || source.sha256 !== hash(source.sql))
      throw Error(`Invalid migration source digest: ${source.name}`);
  }
  const seen = new Set<string>();
  for (const entry of applied) {
    if (seen.has(entry.name)) throw Error(`Duplicate applied migration: ${entry.name}`);
    seen.add(entry.name);
    const source = ordered.find((candidate) => candidate.name === entry.name);
    if (!source) throw Error(`Applied migration is missing from source: ${entry.name}`);
    if (source.sha256 !== entry.sha256)
      throw Error(`Applied migration ${entry.name} was modified.`);
  }
  if (ordered.slice(0, applied.length).some((source) => !seen.has(source.name)))
    throw Error('Applied migrations are not a contiguous source prefix.');
  const pending = ordered.slice(applied.length);
  const inventory = ordered.map(({ name, sha256 }) => ({ name, sha256 }));
  return {
    appliedCount: applied.length,
    pending,
    inventory,
    inventorySha256: hash(JSON.stringify(inventory)),
  };
}

/** Session advisory locks require a direct connection, never a Neon pooler. */
export function validateMigrationConnection(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Error('Invalid migration database URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  )
    throw Error('A PostgreSQL migration URL with an explicit database is required.');
  if (url.hostname.split('.')[0]?.endsWith('-pooler'))
    throw Error('Migrations require a direct connection, not a transaction pooler.');
  if (['cornerstone_runtime', 'cornerstone_worker'].includes(decodeURIComponent(url.username)))
    throw Error('Migrations require a separate owner, not a runtime or worker role.');
}

export async function runMigrations(
  client: pg.Client,
  sources: readonly MigrationSource[],
  options: { checkOnly?: boolean; ledgerSchema?: string } = {},
) {
  const schema = options.ledgerSchema ?? 'public';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw Error('Invalid ledger schema.');
  const ledger = `"${schema}"."schema_migrations"`;
  const lockName =
    schema === 'public'
      ? 'cornerstone-schema-migrations'
      : `cornerstone-schema-migrations:${schema}`;
  const acquired = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
    lockName,
  ]);
  if (acquired.rows[0]?.locked !== true)
    throw Error('Another migration is in progress; retry after it completes.');
  try {
    const existing = await client.query('SELECT to_regclass($1) AS name', [ledger]);
    const applied = existing.rows[0]?.name
      ? (await client.query<AppliedMigration>(`SELECT name,sha256 FROM ${ledger} ORDER BY name`))
          .rows
      : [];
    const plan = planMigrations(sources, applied);
    if (!options.checkOnly)
      for (const source of plan.pending) {
        await client.query('BEGIN');
        try {
          await client.query(source.sql);
          await client.query(`INSERT INTO ${ledger}(name,sha256) VALUES($1,$2)`, [
            source.name,
            source.sha256,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    return {
      ...plan,
      executed: options.checkOnly ? [] : plan.pending.map((source) => source.name),
    };
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
  }
}
