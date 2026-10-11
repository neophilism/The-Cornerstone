import pg from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { strict as assert } from 'node:assert';
import {
  loadMigrations,
  runMigrations,
  type MigrationSource,
} from '../scripts/migration-engine.js';
if (process.env['DATA_REALM'] !== 'simulation' || !process.env['MIGRATION_DATABASE_URL'])
  throw Error('An isolated synthetic migration database is required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
const peer = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
const schema = `migration_acceptance_${randomUUID().replaceAll('-', '')}`;
const source = (name: string, sql: string): MigrationSource => ({
  name,
  sql,
  sha256: createHash('sha256').update(sql).digest('hex'),
});
const fixtures = [
  source(
    '001-ledger.sql',
    'CREATE TABLE schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());',
  ),
  source(
    '002-marker.sql',
    'CREATE TABLE marker(id integer PRIMARY KEY); INSERT INTO marker VALUES(1);',
  ),
];
await owner.connect();
await peer.connect();
try {
  // The real schema must be fully checksummed and re-running must leave timestamps unchanged.
  const before = (await owner.query('SELECT * FROM public.schema_migrations ORDER BY name')).rows;
  assert.equal((await runMigrations(owner, await loadMigrations())).executed.length, 0);
  assert.deepEqual(
    (await owner.query('SELECT * FROM public.schema_migrations ORDER BY name')).rows,
    before,
  );
  await owner.query(`CREATE SCHEMA "${schema}"`);
  await owner.query(`SET search_path TO "${schema}"`);
  const options = { ledgerSchema: schema };
  assert.equal(
    (await runMigrations(owner, fixtures, { ...options, checkOnly: true })).pending.length,
    2,
  );
  assert.equal(
    (await owner.query('SELECT to_regclass($1) AS name', [`${schema}.schema_migrations`])).rows[0]
      .name,
    null,
  );
  assert.equal((await runMigrations(owner, fixtures, options)).executed.length, 2);
  assert.equal((await runMigrations(owner, fixtures, options)).executed.length, 0);
  // A mid-file error must roll back both its DDL and its ledger entry.
  const broken = source('003-broken.sql', 'CREATE TABLE rollback_marker(id integer); SELECT 1/0;');
  await assert.rejects(runMigrations(owner, [...fixtures, broken], options), /division by zero/);
  assert.equal(
    (await owner.query('SELECT to_regclass($1) AS name', [`${schema}.rollback_marker`])).rows[0]
      .name,
    null,
  );
  assert.equal((await owner.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n, 2);
  // An altered historical entry fails before a later new migration can write.
  const third = source('003-next.sql', 'CREATE TABLE next_marker(id integer);');
  await assert.rejects(
    runMigrations(owner, [fixtures[0]!, source('002-marker.sql', 'SELECT 7;'), third], options),
    /modified/,
  );
  assert.equal(
    (await owner.query('SELECT to_regclass($1) AS name', [`${schema}.next_marker`])).rows[0].name,
    null,
  );
  await assert.rejects(runMigrations(owner, [fixtures[0]!], options), /missing/);
  // A competing migrator cannot inspect a stale ledger or perform any writes.
  const lock = `cornerstone-schema-migrations:${schema}`;
  await peer.query('SELECT pg_advisory_lock(hashtext($1))', [lock]);
  await assert.rejects(runMigrations(owner, [...fixtures, third], options), /in progress/);
  await peer.query('SELECT pg_advisory_unlock(hashtext($1))', [lock]);
  assert.deepEqual((await runMigrations(owner, [...fixtures, third], options)).executed, [
    '003-next.sql',
  ]);
  console.log(
    'PASS: complete checksums, no-op replay, dry-run, transactional DDL rollback, drift refusal and exclusive migration locking.',
  );
} finally {
  // Drop only this test's newly created, randomly named scratch schema, never a database or user schema.
  await owner.query('SET search_path TO public');
  await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await owner.end();
  await peer.end();
}
