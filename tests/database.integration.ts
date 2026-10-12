import { fixtureKey } from './fixture-key.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { ProgramService } from '../apps/api/src/service.js';
import type { Actor } from '@cornerstone/contracts';
if (!process.env['DATABASE_URL'] || !process.env['MIGRATION_DATABASE_URL'])
  throw Error('Isolated runtime and migration database connections required.');
if (process.env['DATA_REALM'] !== 'simulation')
  throw Error('Explicit synthetic simulation realm required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
try {
  await store.verifyRole();
  await owner.query('BEGIN');
  await owner.query(await readFile('tests/database-policy.sql', 'utf8'));
  await owner.query('COMMIT');
  const a: Actor = {
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
  const b = { ...a, id: randomUUID() };
  for (const actor of [a, b])
    await owner.query(
      "INSERT INTO actors(id,realm,issuer,subject) VALUES($1::uuid,'simulation','synthetic:api-test',$2::text)",
      [actor.id, actor.id],
    );
  const service = new ProgramService(store, 'simulation', 'simulation');
  const command = {
    kind: 'dossier',
    title: 'Synthetic concurrent preparation',
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
    idempotencyKey: randomUUID(),
  };
  const [one, two] = await Promise.all([service.create(a, command), service.create(a, command)]);
  assert.equal(one.receipt.id, two.receipt.id);
  assert.ok(one.record);
  assert.equal((await store.list(b)).length, 0);
  await assert.rejects(
    service.create(a, { ...command, title: 'Different same-key command' }),
    /different command/,
  );
  const record = one.record!;
  const edited = await service.command(a, {
    recordId: record.id,
    action: 'save_draft',
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    input: { ...command.input, lossDescription: 'Corrected invented loss' },
  });
  assert.equal(edited.record?.state, 'draft');
  assert.equal(edited.record?.data['lossDescription'], 'Corrected invented loss');
  const next = await service.command(a, {
    recordId: record.id,
    action: 'mark_ready',
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
    input: {},
  });
  assert.equal(next.record?.state, 'ready');
  assert.equal(next.receipt.version, 3);
  const replay = await service.create(a, command);
  assert.equal(replay.receipt.id, one.receipt.id);
  assert.deepEqual(replay.record, one.record);
  const claimInput = {
    eventId: randomUUID(),
    workerType: 'employee',
    earnedIncomeShare: 0.75,
    annualHours: 1200,
    injuryDescription: 'Invented primary-job loss',
    lossDate: '2000-01-01',
    evidenceIds: [randomUUID()],
  };
  const claimDraft = await service.create(a, {
    kind: 'claim',
    title: 'Invented editable optional baseline',
    input: claimInput,
    idempotencyKey: randomUUID(),
  });
  const { earnedIncomeShare: removed, ...withoutShare } = claimInput;
  const cleared = await service.command(a, {
    recordId: claimDraft.record!.id,
    action: 'save_draft',
    expectedVersion: 1,
    input: withoutShare,
    idempotencyKey: randomUUID(),
  });
  assert.equal(removed, 0.75);
  assert.equal('earnedIncomeShare' in cleared.record!.data, false);
  assert.equal(cleared.record!.data['annualHours'], 1200);
  await assert.rejects(
    service.command(a, {
      recordId: record.id,
      action: 'reopen',
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      input: {},
    }),
    /changed/,
  );
  await assert.rejects(
    service.command(b, {
      recordId: record.id,
      action: 'reopen',
      expectedVersion: 3,
      idempotencyKey: randomUUID(),
      input: {},
    }),
    /not found/,
  );
  // Known prerequisite failures must remain definite rejections through the private proxy.
  const commerce: Actor = { ...a, roles: ['commerce'] };
  const round = await service.create(commerce, {
    kind: 'round',
    title: 'Invented prerequisite rejection',
    input: {
      offerIds: [randomUUID()],
      associationIds: [randomUUID()],
      opens: '2030-01-01',
      closes: '2030-02-01',
      algorithm: 'synthetic-v1',
      custodyProtocol: 'Invented preparation only; no custody provider',
    },
    idempotencyKey: randomUUID(),
  });
  const blocked = {
    recordId: round.record!.id,
    action: 'publish',
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    input: {},
  };
  for (let attempt = 0; attempt < 2; attempt++)
    await assert.rejects(service.command(commerce, blocked), (error: unknown) => {
      const rejection = error as { code?: string; status?: number };
      assert.equal(rejection.code, 'CUSTODY_REVIEW_REQUIRED');
      assert.equal(rejection.status, 409);
      return true;
    });
  const unchanged = (await store.list(commerce)).find((entry) => entry.id === round.record!.id);
  assert.equal(unchanged?.version, 1);
  assert.equal(unchanged?.state, 'draft');
  const roundEffects = await owner.query(
    'SELECT (SELECT count(*)::int FROM receipts WHERE record_id=$1) AS receipts, (SELECT count(*)::int FROM outbox WHERE record_id=$1) AS events',
    [round.record!.id],
  );
  assert.deepEqual(roundEffects.rows[0], { receipts: 1, events: 1 });
  const count = await owner.query('SELECT count(*)::int n FROM receipts WHERE record_id=$1', [
    record.id,
  ]);
  assert.equal(count.rows[0].n, 3);
  const encrypted = await owner.query('SELECT payload_cipher FROM case_records WHERE id=$1', [
    record.id,
  ]);
  assert.ok(!JSON.stringify(encrypted.rows).includes('Invented work'));
  await assert.rejects(
    owner.query('UPDATE receipts SET action=$1 WHERE id=$2', ['tampered', next.receipt.id]),
    /Append-only/,
  );
  console.log(
    'PASS: real PostgreSQL RLS, concurrency/idempotency, stale versions, ciphertext and immutable receipts.',
  );
} finally {
  await store.close();
  await owner.end();
}
