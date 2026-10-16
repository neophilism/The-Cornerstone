import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import {
  prepareEvidence,
  evidenceRequest,
  evidenceResult,
} from '../packages/ui/src/evidence-recovery.js';
const sim = await new Simulation().connect();
try {
  const actor = await sim.person(),
    outsider = await sim.person();
  const record = await sim.create(actor, 'dossier', 'Invented evidence recovery', {
    actionDescription: 'Invented action',
    livelihood: 'Invented work',
    lossDescription: 'Invented loss',
  });
  const upload = prepareEvidence(
    'evidence/upload',
    {
      recordId: record.id,
      expectedVersion: 1,
      idempotencyKey: randomUUID(),
      filename: 'invented.txt',
      description: 'Invented recovery text',
      base64: Buffer.from('Invented bytes').toString('base64'),
      attestedSynthetic: true,
    },
    record,
  );
  const accepted = evidenceResult(
    await sim.evidence.upload(actor, evidenceRequest(upload)),
    upload,
  );
  const retries = await Promise.all([
    sim.evidence.upload(actor, evidenceRequest(upload)),
    sim.evidence.upload(actor, evidenceRequest(upload)),
  ]);
  for (const result of retries) assert.deepEqual(evidenceResult(result, upload), accepted);
  const item = (await sim.evidence.list(actor, record.id)).evidence[0]!;
  const validation = prepareEvidence(
    'evidence/validate',
    { recordId: record.id, expectedVersion: 2, idempotencyKey: randomUUID(), evidenceId: item.id },
    accepted.record,
  );
  const validated = evidenceResult(
    await sim.evidence.validate(actor, evidenceRequest(validation)),
    validation,
  );
  assert.equal(validated.record.version, 3);
  assert.deepEqual(
    evidenceResult(await sim.evidence.upload(actor, evidenceRequest(upload)), upload),
    accepted,
  );
  assert.deepEqual(
    evidenceResult(await sim.evidence.validate(actor, evidenceRequest(validation)), validation),
    validated,
  );
  await assert.rejects(sim.evidence.upload(outsider, evidenceRequest(upload)), /not found/i);
  await sim.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    record.id,
  ]);
  const conflicted = await sim.actor(actor.id);
  await assert.rejects(sim.evidence.upload(conflicted, evidenceRequest(upload)), /not found/i);
  await assert.rejects(
    sim.evidence.validate(conflicted, evidenceRequest(validation)),
    /not found/i,
  );
  assert.equal(
    (
      await sim.owner.query('SELECT count(*) n FROM evidence_objects WHERE record_id=$1', [
        record.id,
      ])
    ).rows[0].n,
    '1',
  );
  assert.equal(
    (await sim.owner.query('SELECT count(*) n FROM receipts WHERE record_id=$1', [record.id]))
      .rows[0].n,
    '3',
  );
  console.log(
    'Evidence recovery: exact upload/validation retries, one attachment, historical receipt, outsider and revoked-author denial passed.',
  );
} finally {
  await sim.close();
}
