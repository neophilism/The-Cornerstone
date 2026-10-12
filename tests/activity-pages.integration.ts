import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import type { Actor } from '@cornerstone/contracts';

const w = await new Simulation().connect();
// Owner-created inbox fixtures test exact timestamps independently of worker delivery,
// which remains covered by activity.integration.ts. Every fixture is invented.
async function fixtures(a: Actor, count: number, title: string) {
  const record = await w.create(a, 'dossier', title, {
    actionDescription: 'Invented action',
    livelihood: 'Invented work',
    lossDescription: 'Invented loss',
  });
  const rows = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    receipt: randomUUID(),
    key: randomUUID(),
    stamp: i < 3 ? '2000-01-01T00:00:00.000002Z' : '2000-01-01T00:00:00.000001Z',
  }));
  await w.owner.query(
    `INSERT INTO receipts(id,realm,actor_id,record_id,version,action,idempotency_key,request_digest,digest,accepted_at)
    SELECT x.receipt,'simulation',$1,$2,1,'create',x.key,repeat('0',64),repeat('0',64),x.stamp
    FROM jsonb_to_recordset($3::jsonb) AS x(receipt uuid,key uuid,stamp timestamptz)`,
    [a.id, record.id, JSON.stringify(rows)],
  );
  await w.owner.query(
    `INSERT INTO activity_notifications(id,realm,recipient_id,record_id,receipt_id,record_version,action,created_at)
    SELECT x.id,'simulation',$1,$2,x.receipt,1,'create',x.stamp
    FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,receipt uuid,stamp timestamptz)`,
    [a.id, record.id, JSON.stringify(rows)],
  );
  return { record, rows };
}
try {
  const a = await w.person(),
    outsider = await w.person();
  const { record, rows } = await fixtures(a, 207, 'Invented exact activity boundary');
  const expected = [...rows]
    .sort((a, b) => b.stamp.localeCompare(a.stamp) || b.id.localeCompare(a.id))
    .map((r) => r.id);
  const first = await w.store.notificationPage(a, { limit: '17' });
  assert.equal(first.notifications.length, 17);
  assert.equal(first.unreadCount, 207);
  assert.ok(first.nextCursor);
  await assert.rejects(
    w.store.notificationPage(outsider, { cursor: first.nextCursor }),
    /page is unavailable/,
  );
  await assert.rejects(
    w.store.notificationPage({ ...a, realm: 'proposal' }, { cursor: first.nextCursor }),
    /page is unavailable/,
  );
  await assert.rejects(
    w.store.notificationPage(a, { cursor: first.nextCursor.slice(0, -8) + 'AAAAAAAA' }),
    /page is unavailable/,
  );
  const seen = first.notifications.map((n) => n.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await w.store.notificationPage(a, { limit: 17, cursor });
    seen.push(...page.notifications.map((n) => n.id));
    cursor = page.nextCursor;
  }
  assert.deepEqual(
    seen,
    expected,
    'All 207 rows exactly once, retaining UUID ties and microseconds',
  );
  assert.deepEqual(await w.store.notificationPage(outsider), {
    notifications: [],
    nextCursor: null,
    unreadCount: 0,
  });
  const marked = await w.store.markActivityRead(a, [expected[0]!, expected[0]!]);
  assert.equal(marked.marked.length, 1);
  assert.equal(marked.unreadCount, 206);
  assert.deepEqual(
    (await w.store.markActivityRead(a, [expected[0]!])).marked,
    marked.marked,
    'Repeated read retains the authoritative timestamp',
  );
  assert.equal((await w.store.markActivityRead(outsider, [expected[1]!])).marked.length, 0);
  assert.equal((await w.store.notificationPage({ ...a, conflicts: [record.id] })).unreadCount, 0);
  await w.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [a.id, record.id]);
  assert.equal(
    (await w.store.notificationPage(a, { cursor: first.nextCursor })).notifications.length,
    0,
    'RLS rechecks database conflicts even with stale actor claims and an old cursor',
  );
  assert.equal((await w.store.markActivityRead(a, [expected[1]!])).marked.length, 0);
  // Stable very old fixtures ensure browser journeys can reach more than one inbox page.
  await fixtures(await w.persona('participant'), 125, 'Invented older inbox record');
  console.log(
    'PASS activity pages: 207 rows, microseconds, cursor binding/tampering, full unread count, repeated reads and current RLS/conflict isolation.',
  );
} finally {
  await w.close();
}
