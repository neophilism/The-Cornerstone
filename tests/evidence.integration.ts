import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { MAX_SYNTHETIC_EVIDENCE_BYTES, type Actor } from '@cornerstone/contracts';
import { ProgramService } from '../apps/api/src/service.js';
import { EvidenceService } from '../apps/api/src/evidence.js';
import { DraftAccessService } from '../apps/api/src/access.js';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL']
)
  throw Error('Isolated synthetic connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const store = new Store(process.env['DATABASE_URL'], randomBytes(32)),
  program = new ProgramService(store, 'simulation', 'simulation'),
  evidence = new EvidenceService(store, 'simulation', 'simulation', 'synthetic-postgres'),
  access = new DraftAccessService(store, 'simulation', 'simulation');
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
  },
  other = { ...actor, id: randomUUID() };
const bytes = Buffer.from('Invented UTF-8 source — no real private data.\n');
function uploadFor(recordId: string, expectedVersion: number, body = bytes) {
  return {
    recordId,
    expectedVersion,
    idempotencyKey: randomUUID(),
    filename: 'invented.txt',
    description: 'Invented direct livelihood account',
    sourceUrl: 'https://example.com/invented',
    sourceDate: '2000-01-01',
    base64: body.toString('base64'),
    attestedSynthetic: true,
  };
}
try {
  for (const a of [actor, other])
    await owner.query(
      "INSERT INTO actors(id,realm,issuer,subject) VALUES($1,'simulation','synthetic:evidence-test',$2)",
      [a.id, a.id],
    );
  const draft = await program.create(actor, {
    kind: 'event_petition',
    title: 'Invented evidence petition',
    idempotencyKey: randomUUID(),
    input: {
      actionDate: '2000-01-01',
      actionText: 'Invented implemented action',
      industry: 'Invented lawful industry',
      objectiveEvidence: 'Invented deliberate objective',
      contraryEvidence: 'Invented contrary evidence',
    },
  });
  const record = draft.record!;
  await assert.rejects(
    program.command(actor, {
      recordId: record.id,
      action: 'submit',
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      input: { attested: true },
    }),
    /Attach and validate/,
  );
  await assert.rejects(
    new EvidenceService(store, 'simulation', 'simulation', 'disabled').upload(
      actor,
      uploadFor(record.id, 1),
    ),
    /not enabled/,
  );
  await assert.rejects(evidence.upload(other, uploadFor(record.id, 1)), /Record not found/);
  await assert.rejects(
    evidence.upload(actor, uploadFor(record.id, 1, Buffer.alloc(MAX_SYNTHETIC_EVIDENCE_BYTES + 1))),
    { code: 'EVIDENCE_SIZE', status: 422 },
  );
  const input = uploadFor(record.id, 1),
    [one, two] = await Promise.all([evidence.upload(actor, input), evidence.upload(actor, input)]);
  assert.equal(one.receipt.id, two.receipt.id);
  assert.equal(one.record!.version, 2);
  let list = await evidence.list(actor, record.id);
  assert.equal(list.evidence.length, 1);
  const item = list.evidence[0]!;
  assert.equal(item.state, 'quarantined');
  assert.equal(item.securityScan, 'not_performed');
  assert.equal(item.legalAcceptance, false);
  await assert.rejects(evidence.download(actor, item.id), /not available/);
  await assert.rejects(evidence.download(other, item.id), /not found/);
  await assert.rejects(
    evidence.list({ ...actor, realm: 'proposal' }, record.id),
    /Record not found/,
  );
  await assert.rejects(
    program.command(actor, {
      recordId: record.id,
      action: 'submit',
      expectedVersion: 2,
      idempotencyKey: randomUUID(),
      input: { attested: true },
    }),
    /Each listed evidence/,
  );
  const valid = await evidence.validate(actor, {
    recordId: record.id,
    evidenceId: item.id,
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
  });
  assert.equal(valid.record!.version, 3);
  list = await evidence.list(actor, record.id);
  assert.equal(list.evidence[0]!.state, 'clean');
  assert.deepEqual((await evidence.download(actor, item.id)).bytes, bytes);
  const raw = await owner.query('SELECT body_cipher FROM evidence_bodies WHERE evidence_id=$1', [
    item.id,
  ]);
  assert.ok(!JSON.stringify(raw.rows).includes('Invented UTF-8'));
  await assert.rejects(
    owner.query('UPDATE evidence_bodies SET body_cipher=$2 WHERE evidence_id=$1', [
      item.id,
      raw.rows[0].body_cipher,
    ]),
    /Append-only/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    record.id,
  ]);
  await assert.rejects(evidence.download(actor, item.id), /not found/);
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [actor.id]);
  const grant = await access.grant(actor, {
    recordId: record.id,
    expectedVersion: 3,
    subjectId: other.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    allowDraftEdits: false,
    consent: true,
    idempotencyKey: randomUUID(),
  });
  assert.deepEqual((await evidence.download(other, item.id)).bytes, bytes);
  await assert.rejects(evidence.upload(other, uploadFor(record.id, 4)), /attachment permission/);
  const grantId = (await access.list(actor, record.id))[0]!.id;
  const revoked = await access.revoke(actor, {
    recordId: record.id,
    expectedVersion: 4,
    grantId,
    idempotencyKey: randomUUID(),
  });
  assert.equal(revoked.record!.version, 5);
  assert.equal(grant.record!.version, 4);
  await assert.rejects(evidence.download(other, item.id), /not found/);
  const submitted = await program.command(actor, {
    recordId: record.id,
    action: 'submit',
    expectedVersion: 5,
    idempotencyKey: randomUUID(),
    input: { attested: true },
  });
  assert.equal(submitted.record!.state, 'submitted');
  await assert.rejects(evidence.upload(actor, uploadFor(record.id, 6)), /ordinary draft/);

  const malformed = await program.create(actor, {
    kind: 'dossier',
    title: 'Invented rejected text',
    idempotencyKey: randomUUID(),
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
  });
  const bad = await evidence.upload(
    actor,
    uploadFor(malformed.record!.id, 1, Buffer.from([255, 0])),
  );
  const badId = (await evidence.list(actor, malformed.record!.id)).evidence[0]!.id;
  const rejected = await evidence.validate(actor, {
    recordId: malformed.record!.id,
    evidenceId: badId,
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
  });
  assert.equal(rejected.record!.version, 3);
  assert.equal(bad.record!.version, 2);
  const rejection = (await evidence.list(actor, malformed.record!.id)).evidence[0]!;
  assert.equal(rejection.state, 'rejected');
  assert.equal(rejection.rejectionCode, 'INVALID_TEXT');
  await assert.rejects(evidence.download(actor, badId), /not available/);
  await owner.query("UPDATE evidence_objects SET ciphertext_hash=repeat('0',64) WHERE id=$1", [
    item.id,
  ]);
  await assert.rejects(evidence.download(actor, item.id), /could not be verified/);
  console.log(
    'PASS: encrypted bounded evidence, quarantine/validation/download, immutable bodies, concurrency, integrity and scoped/conflict/realm access; empty or unavailable evidence cannot support submission.',
  );
} finally {
  await store.close();
  await owner.end();
}
