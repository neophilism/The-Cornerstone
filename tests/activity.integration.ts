import { fixtureKey } from './fixture-key.js';
import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { ProgramService } from '../apps/api/src/service.js';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import type { Actor } from '@cornerstone/contracts';

if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL'] ||
  !process.env['WORKER_DATABASE_URL']
)
  throw Error('Isolated synthetic owner, runtime and worker connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
const worker = new ActivityWorker(process.env['WORKER_DATABASE_URL']);
const otherWorker = new ActivityWorker(process.env['WORKER_DATABASE_URL']);
const actor: Actor = {
  id: randomUUID(),
  realm: 'simulation',
  roles: ['participant'],
  institutionId: null,
  jurisdiction: null,
  assurance: 'draft',
  assignments: [],
  conflicts: [],
  authenticationTime: new Date().toISOString(),
};
const unrelated = { ...actor, id: randomUUID() };
const service = new ProgramService(store, 'simulation', 'simulation');
async function draft(title: string) {
  return service.create(actor, {
    kind: 'dossier',
    title,
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
    idempotencyKey: randomUUID(),
  });
}
async function eventFor(receipt: string) {
  const q = await owner.query('SELECT * FROM outbox WHERE receipt_id=$1', [receipt]);
  assert.equal(q.rowCount, 1);
  return q.rows[0];
}
async function lease(receipt: string) {
  const event = await eventFor(receipt);
  const jobs = await worker.pool.query('SELECT * FROM lease_activity_events($1,100)', [worker.id]);
  const leased = jobs.rows.find((x) => x.event_id === event.id);
  assert.ok(leased, 'Expected synthetic event to be leased');
  return leased;
}
try {
  await store.verifyRole();
  await worker.verifyRole();
  await otherWorker.verifyRole();
  for (const a of [actor, unrelated])
    await owner.query(
      "INSERT INTO actors(id,realm,issuer,subject) VALUES($1,'simulation','synthetic:activity-test',$2)",
      [a.id, a.id],
    );
  for (const table of ['case_records', 'sessions', 'evidence_objects', 'outbox'])
    await assert.rejects(worker.pool.query(`SELECT * FROM ${table}`), /permission denied/);
  await assert.rejects(
    store.pool.query('SELECT * FROM lease_activity_events($1,1)', [randomUUID()]),
    /permission denied/,
  );
  await assert.rejects(
    worker.pool.query('SELECT * FROM lease_activity_events($1,NULL)', [worker.id]),
    /Invalid worker/,
  );
  await assert.rejects(
    worker.pool.query('SELECT * FROM lease_activity_events($1,101)', [worker.id]),
    /Invalid worker/,
  );
  await worker.once(100); // Other synthetic integration fixtures may already have pending work.
  const saved = await draft('Invented activity concurrency');
  await Promise.all([worker.once(100), otherWorker.once(100)]);
  assert.equal((await eventFor(saved.receipt.id)).state, 'delivered');
  assert.equal((await store.notifications(actor)).length, 1);
  const notice = (await store.notifications(actor))[0]!;
  assert.equal(notice.receiptId, saved.receipt.id);
  assert.equal(notice.legalService, false);
  assert.equal((await store.notifications(unrelated)).length, 0);
  await store.markActivityRead(unrelated, [notice.id]);
  assert.equal((await store.notifications(actor))[0]!.readAt, null);
  await store.markActivityRead(actor, [notice.id]);
  const firstRead = (await store.notifications(actor))[0]!.readAt;
  assert.ok(firstRead);
  await store.markActivityRead(actor, [notice.id]);
  assert.equal((await store.notifications(actor))[0]!.readAt, firstRead);
  await assert.rejects(
    store.transaction(actor, (tx) =>
      tx.query("UPDATE activity_notifications SET action='changed' WHERE id=$1", [notice.id]),
    ),
    /permission denied/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    saved.record!.id,
  ]);
  assert.equal((await store.notifications(actor)).length, 0);
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [actor.id]);

  const recovery = await draft('Invented lease recovery');
  const old = await lease(recovery.receipt.id);
  await owner.query("UPDATE outbox SET leased_until=now()-interval '1 second' WHERE id=$1", [
    old.event_id,
  ]);
  const replacement = await lease(recovery.receipt.id);
  assert.notEqual(replacement.token, old.token);
  await assert.rejects(
    worker.pool.query('SELECT deliver_activity_event($1,$2)', [old.event_id, old.token]),
    /LEASE_LOST/,
  );
  await worker.pool.query('SELECT deliver_activity_event($1,$2)', [
    replacement.event_id,
    replacement.token,
  ]);
  await assert.rejects(
    worker.pool.query('SELECT deliver_activity_event($1,$2)', [
      replacement.event_id,
      replacement.token,
    ]),
    /LEASE_LOST/,
  );
  const exactlyOnce = await owner.query(
    'SELECT count(*)::int n FROM activity_notifications WHERE receipt_id=$1',
    [recovery.receipt.id],
  );
  assert.equal(exactlyOnce.rows[0].n, 1);

  const retry = await draft('Invented bounded retry');
  const failing = await lease(retry.receipt.id);
  await assert.rejects(
    worker.pool.query('SELECT fail_activity_event($1,$2,$3)', [
      failing.event_id,
      failing.token,
      'private error text',
    ]),
    /Invalid diagnostic/,
  );
  await worker.pool.query('SELECT fail_activity_event($1,$2,$3)', [
    failing.event_id,
    failing.token,
    'DELIVERY_ERROR',
  ]);
  assert.equal((await eventFor(retry.receipt.id)).error_code, 'DELIVERY_ERROR');
  assert.equal((await worker.once()).leased, 0);
  await owner.query(
    "UPDATE outbox SET attempts=7,available_at=now()-interval '1 second' WHERE id=$1",
    [failing.event_id],
  );
  const final = await lease(retry.receipt.id);
  assert.equal(final.attempt, 8);
  await worker.pool.query('SELECT fail_activity_event($1,$2,$3)', [
    final.event_id,
    final.token,
    'WORKER_INTERRUPTED',
  ]);
  const exhausted = await eventFor(retry.receipt.id);
  assert.equal(exhausted.error_code, 'RETRIES_EXHAUSTED');
  assert.ok(exhausted.finished_at);
  assert.equal((await worker.once()).leased, 0);

  const interrupted = await draft('Invented final expired lease');
  const lost = await lease(interrupted.receipt.id);
  await owner.query(
    "UPDATE outbox SET attempts=8,leased_until=now()-interval '1 second' WHERE id=$1",
    [lost.event_id],
  );
  await worker.once();
  assert.equal((await eventFor(interrupted.receipt.id)).error_code, 'RETRIES_EXHAUSTED');
  console.log(
    'PASS: restricted worker, concurrent delivery, recipient RLS, durable read state, lease recovery and bounded retries.',
  );
} finally {
  await Promise.all([worker.close(), otherWorker.close(), store.close(), owner.end()]);
}
