import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { Store, verifySchema } from '@cornerstone/store';
import { digest } from '@cornerstone/security';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import { allowedDisposableCiDatabase } from '../scripts/allowed-ci-db.mjs';
import { Simulation } from './helpers/simulation.js';
import { fixtureKey } from './fixture-key.js';

// This rehearsal is deliberately unavailable for arbitrary local or hosted databases.
const container = process.env['POSTGRES_CONTAINER'] ?? '';
const connections = ['MIGRATION_DATABASE_URL', 'DATABASE_URL', 'WORKER_DATABASE_URL'];
if (
  process.env['CI'] !== 'true' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  process.env['DATA_REALM'] !== 'simulation' ||
  !/^[a-f0-9]{12,64}$/.test(container) ||
  connections.some(
    (name) => !allowedDisposableCiDatabase('.github/workflows/ci.yml', process.env[name]),
  )
)
  throw Error(
    'Restore rehearsal accepts only the disposable checked-in CI database and container.',
  );
const restoredName = 'cornerstone_restore_test';
const dump = '/tmp/cornerstone-restore-' + randomUUID() + '.dump';
function docker(args: string[]) {
  const result = spawnSync('docker', ['exec', container, ...args], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw Error('Disposable PostgreSQL backup/restore step failed.');
  return result.stdout.trim();
}
function restoredUrl(name: string) {
  const url = new URL(process.env[name]!);
  url.pathname = '/' + restoredName;
  return url.toString();
}
const world = await new Simulation().connect();
let created = false;
const restoredOwner = new pg.Client({ connectionString: restoredUrl('MIGRATION_DATABASE_URL') });
const restored = new Store(restoredUrl('DATABASE_URL'), fixtureKey());
const wrongKey = new Store(restoredUrl('DATABASE_URL'), randomBytes(32));
const worker = new ActivityWorker(restoredUrl('WORKER_DATABASE_URL'));
const started = performance.now();
try {
  const person = await world.person(),
    outsider = await world.person();
  const record = await world.create(person, 'dossier', 'Invented restore rehearsal', {
    actionDescription: 'Invented restore action',
    livelihood: 'Invented synthetic livelihood',
    lossDescription: 'Invented synthetic loss',
  });
  const accepted = await world.command(person, record, 'mark_ready', {});
  const current = (await world.get(person, record.id))!;
  // Bind the Docker target to the exact database reached through the checked CI URL.
  assert.equal(
    docker([
      'psql',
      '-U',
      'cornerstone_migration',
      '-d',
      'cornerstone_test',
      '-Atc',
      `SELECT count(*) FROM case_records WHERE id='${record.id}'::uuid`,
    ]),
    '1',
  );
  const rows = async (client: pg.Client, table: string) =>
    (
      await client.query(
        `SELECT * FROM ${table} WHERE ${table === 'case_records' ? 'id' : 'record_id'}=$1 ORDER BY 1,2`,
        [record.id],
      )
    ).rows;
  const tables = [
    'case_records',
    'case_versions',
    'case_version_owners',
    'receipts',
    'audit_events',
    'outbox',
  ];
  const before = new Map<string, unknown>();
  for (const table of tables) before.set(table, await rows(world.owner, table));
  const schema = (
    await world.owner.query('SELECT name,sha256 FROM schema_migrations ORDER BY name')
  ).rows;
  // CREATE fails if a database already exists. Never replace or clean up someone else's database.
  await world.owner.query(`CREATE DATABASE ${restoredName}`);
  created = true;
  docker([
    'pg_dump',
    '-U',
    'cornerstone_migration',
    '-d',
    'cornerstone_test',
    '--format=custom',
    '--file=' + dump,
  ]);
  const backedUp = performance.now();
  docker([
    'pg_restore',
    '-U',
    'cornerstone_migration',
    '--dbname=' + restoredName,
    '--exit-on-error',
    '--single-transaction',
    dump,
  ]);
  const restoredAt = performance.now();
  await restoredOwner.connect();
  for (const table of tables)
    assert.deepEqual(
      await rows(restoredOwner, table),
      before.get(table),
      table + ' bytes changed during restore',
    );
  assert.deepEqual(
    (await restoredOwner.query('SELECT name,sha256 FROM schema_migrations ORDER BY name')).rows,
    schema,
  );
  await restored.verifyRole();
  await verifySchema(restored.pool);
  await worker.verifyRole();
  await verifySchema(worker.pool);
  assert.equal(
    (await restored.pool.query('SELECT count(*)::int AS n FROM case_records')).rows[0].n,
    0,
  );
  assert.equal(await restored.transaction(outsider, (tx) => restored.get(tx, record.id)), null);
  assert.deepEqual(
    await restored.transaction(person, (tx) => restored.get(tx, record.id)),
    current,
  );
  await assert.rejects(wrongKey.transaction(person, (tx) => wrongKey.get(tx, record.id)));
  const history = await restored.transaction(person, (tx) =>
    restored.getVersion(tx, record.id, accepted.receipt.version),
  );
  assert.equal(
    digest({ record: history, action: accepted.receipt.action, actorId: person.id }),
    accepted.receipt.digest,
  );
  assert.deepEqual(
    await restored.transaction(person, (tx) =>
      restored.ownReceipt(tx, person, accepted.receipt.id),
    ),
    accepted.receipt,
  );
  const policies = `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY relname`;
  assert.deepEqual(
    (await restoredOwner.query(policies)).rows,
    (await world.owner.query(policies)).rows,
  );
  await assert.rejects(
    restored.pool.query('UPDATE schema_migrations SET sha256=sha256'),
    /permission denied/,
  );
  await assert.rejects(worker.pool.query('SELECT * FROM case_records'), /permission denied/);
  console.log(
    JSON.stringify({
      result: 'PASS',
      scope: 'disposable synthetic same-cluster PostgreSQL restore',
      backupMilliseconds: Math.round(backedUp - started),
      restoreMilliseconds: Math.round(restoredAt - backedUp),
      verificationMilliseconds: Math.round(performance.now() - restoredAt),
      checkedTables: tables.length,
      checks: [
        'exact ciphertext/history/receipt/audit/outbox bytes',
        'schema inventory',
        'runtime and worker least privilege',
        'forced RLS',
        'authorized decryption',
        'outsider and missing-key denial',
      ],
    }),
  );
} finally {
  await Promise.all([restored.close(), wrongKey.close(), worker.close(), restoredOwner.end()]);
  if (created) await world.owner.query(`DROP DATABASE ${restoredName}`);
  try {
    docker(['rm', '-f', dump]);
  } finally {
    await world.close();
  }
}
