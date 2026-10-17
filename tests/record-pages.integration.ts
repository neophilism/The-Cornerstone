import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import type { Actor } from '@cornerstone/contracts';
import { RecordReader } from '../apps/api/src/records.js';
import { fixtureKey } from './fixture-key.js';

if (
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL'] ||
  process.env['DATA_REALM'] !== 'simulation'
)
  throw Error('Isolated synthetic runtime and migration connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
await owner.connect();
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
const outsider = { ...actor, id: randomUUID() };
const reader = new RecordReader(store);
async function fixtures(personId: string, count: number, prefix: string) {
  const rows = Array.from({ length: count }, (_, i) => {
    const id = randomUUID();
    // Shared microsecond timestamp deliberately tests the UUID tie-break.
    const stamp = i === 0 ? '2000-01-01T00:00:00.000002Z' : '2000-01-01T00:00:00.000001Z';
    return {
      id,
      stamp,
      title: `${prefix} ${String(i + 1).padStart(3, '0')}`,
      payload: store.seal(
        {
          title: `${prefix} ${String(i + 1).padStart(3, '0')}`,
          data: {
            actionDescription: 'Invented action',
            livelihood: 'Invented work',
            lossDescription: 'Invented loss',
          },
        },
        `cornerstone:record:${id}:1`,
      ),
    };
  });
  await owner.query(
    `INSERT INTO case_records(id,realm,kind,state,version,owner_id,policy_version,payload_cipher,created_at,updated_at)
    SELECT x.id,'simulation','dossier','draft',1,$1,'proposal-v1',x.payload,x.stamp,x.stamp
    FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,payload jsonb,stamp timestamptz)`,
    [personId, JSON.stringify(rows)],
  );
  return rows;
}
try {
  await store.verifyRole();
  for (const a of [actor, outsider])
    await owner.query(
      "INSERT INTO actors(id,realm,issuer,subject,roles) VALUES($1::uuid,'simulation','synthetic:record-pages',$1::text,ARRAY['participant'])",
      [a.id],
    );
  const rows = await fixtures(actor.id, 207, 'Invented page boundary');
  const expected = [...rows]
    .sort((a, b) => b.stamp.localeCompare(a.stamp) || b.id.localeCompare(a.id))
    .map((r) => r.id);
  const first = await reader.read(actor, { limit: '17' });
  assert.deepEqual(first.context, { actorId: actor.id, realm: actor.realm });
  assert.equal(first.records.length, 17);
  assert.ok(first.nextCursor);
  assert.equal(first.capabilities[0]?.actions.includes('save_draft'), true);
  await assert.rejects(reader.read(outsider, { cursor: first.nextCursor }), /page is unavailable/);
  await assert.rejects(
    reader.read(actor, { cursor: first.nextCursor.slice(0, -8) + 'AAAAAAAA' }),
    /page is unavailable/,
  );
  for (const input of [
    { limit: '0' },
    { limit: '201' },
    { limit: '1.1' },
    { cursor: '!' },
    { recordId: rows[0]!.id, limit: 2 },
    { title: 'invented' },
  ])
    await assert.rejects(reader.read(actor, input));
  const seen = first.records.map((r) => r.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await reader.read(actor, { cursor, limit: 17 });
    seen.push(...page.records.map((r) => r.id));
    cursor = page.nextCursor;
  }
  assert.deepEqual(
    seen,
    expected,
    'every row beyond 200 appears exactly once, including microsecond ties',
  );
  assert.equal((await reader.read(outsider)).records.length, 0);
  await assert.rejects(reader.read(outsider, { recordId: rows[0]!.id }), /not found/);
  const referenced = await reader.read(actor, { recordId: expected.at(-1) });
  assert.deepEqual(referenced.context, { actorId: actor.id, realm: actor.realm });
  assert.equal(referenced.records[0]?.id, expected.at(-1));
  assert.equal(referenced.nextCursor, null);
  assert.deepEqual(
    referenced.capabilities.map(({ recordId, version }) => ({ recordId, version })),
    [{ recordId: referenced.records[0]!.id, version: referenced.records[0]!.version }],
  );
  await assert.rejects(
    reader.read({ ...actor, conflicts: [rows[0]!.id] }, { recordId: rows[0]!.id }),
    /not found/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    rows[0]!.id,
  ]);
  assert.equal(
    (await reader.read(actor)).records.some((r) => r.id === rows[0]!.id),
    false,
    'database conflict check also denies stale actor claims',
  );
  await assert.rejects(reader.read(actor, { recordId: rows[0]!.id }), /not found/);
  // Old synthetic fixtures let the browser verify paging without hiding current journey prerequisites.
  const participant = await owner.query(
    "SELECT id FROM actors WHERE realm='simulation' AND issuer='cornerstone:synthetic-development' AND subject='participant'",
  );
  await fixtures(participant.rows[0].id, 205, 'Invented older preparation');
  console.log(
    'PASS scoped pagination: 207 exact rows, microseconds, ties, cursor integrity, bounds, reference lookup and outsider/conflict denial.',
  );
} finally {
  await owner.end();
  await store.pool.end();
}
