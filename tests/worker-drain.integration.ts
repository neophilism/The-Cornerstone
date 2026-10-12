import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Store } from '@cornerstone/store';
import type { Actor } from '@cornerstone/contracts';
import { ProgramService } from '../apps/api/src/service.js';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import { fixtureKey } from './fixture-key.js';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL'] ||
  !process.env['WORKER_DATABASE_URL']
)
  throw Error('Separate isolated synthetic owner, runtime and worker credentials required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
const worker = new ActivityWorker(process.env['WORKER_DATABASE_URL']);
const successor = new ActivityWorker(process.env['WORKER_DATABASE_URL']);
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
const service = new ProgramService(store, 'simulation', 'simulation');
await owner.connect();
try {
  await store.verifyRole();
  await worker.verifyRole();
  await successor.verifyRole();
  await owner.query(
    "INSERT INTO actors(id,realm,issuer,subject) VALUES($1,'simulation','synthetic:worker-drain',$2)",
    [actor.id, actor.id],
  );
  for (const stage of ['lease', 'delivery']) {
    const receipts: string[] = [];
    for (let i = 0; i < 2; i++) {
      const result = await service.create(actor, {
        kind: 'dossier',
        title: `Invented worker drain ${stage} ${i}`,
        input: {
          actionDescription: 'Invented action',
          livelihood: 'Invented work',
          lossDescription: 'Invented loss',
        },
        idempotencyKey: randomUUID(),
      });
      receipts.push(result.receipt.id);
    }
    // Prioritize these two invented fixtures only, without changing unrelated events.
    await owner.query(
      "UPDATE outbox SET available_at='1970-01-01' WHERE receipt_id=ANY($1::uuid[])",
      [receipts],
    );
    const stop = new AbortController();
    const original = worker.pool.query.bind(worker.pool);
    const descriptor = Object.getOwnPropertyDescriptor(worker.pool, 'query');
    // Instrument after actual database completion, not instead of running SQL.
    Object.defineProperty(worker.pool, 'query', {
      configurable: true,
      writable: true,
      value: async (sql: string, values: unknown[]) => {
        const result = await original(sql, values);
        if (
          sql.startsWith(
            stage === 'lease'
              ? 'SELECT * FROM lease_activity_events'
              : 'SELECT deliver_activity_event',
          )
        )
          stop.abort();
        return result;
      },
    });
    try {
      const result = await worker.once(2, stop.signal);
      assert.equal(result.leased, 2);
      assert.equal(result.delivered, stage === 'lease' ? 0 : 1);
    } finally {
      if (descriptor) Object.defineProperty(worker.pool, 'query', descriptor);
      else Reflect.deleteProperty(worker.pool, 'query');
    }
    const rows = await owner.query(
      'SELECT id,state,attempts FROM outbox WHERE receipt_id=ANY($1::uuid[])',
      [receipts],
    );
    const unfinished = rows.rows.filter((row) => row.state === 'leased');
    assert.equal(unfinished.length, stage === 'lease' ? 2 : 1);
    assert.ok(rows.rows.every((row) => row.attempts === 1));
    // Simulate expiry only for this test's unfinished leases; recovery uses the real restricted worker.
    await owner.query(
      "UPDATE outbox SET leased_until=now()-interval '1 second' WHERE id=ANY($1::uuid[]) AND state='leased'",
      [unfinished.map((row) => row.id)],
    );
    const recovered = await successor.once(unfinished.length);
    assert.equal(recovered.delivered, unfinished.length);
    const finished = await owner.query(
      'SELECT state,attempts FROM outbox WHERE receipt_id=ANY($1::uuid[])',
      [receipts],
    );
    assert.ok(finished.rows.every((row) => row.state === 'delivered'));
    const notices = await owner.query(
      'SELECT receipt_id,count(*)::int AS count FROM activity_notifications WHERE receipt_id=ANY($1::uuid[]) AND recipient_id=$2 GROUP BY receipt_id',
      [receipts, actor.id],
    );
    assert.equal(notices.rows.length, 2);
    assert.ok(notices.rows.every((row) => row.count === 1));
  }
  console.log(
    'Actual PostgreSQL worker drain acceptance passed: interrupted lease/delivery, durable unfinished work, expiry recovery and once-per-recipient inbox insertion.',
  );
} finally {
  await worker.close();
  await successor.close();
  await store.close();
  await owner.end();
}
