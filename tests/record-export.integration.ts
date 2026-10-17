import { strict as assert } from 'node:assert';
import { Simulation } from './helpers/simulation.js';
import { RecordReader } from '../apps/api/src/records.js';
import { reviewRecordExport, confirmRecordExport } from '../packages/ui/src/record-export.js';
const sim = await new Simulation().connect();
try {
  const actor = await sim.person();
  const record = await sim.create(actor, 'dossier', 'Invented export record', {
    actionDescription: 'Invented export action',
    livelihood: 'Invented export work',
    lossDescription: 'Invented export loss',
  });
  const reader = new RecordReader(sim.store);
  const reviewed = reviewRecordExport(
    await reader.read(actor, { recordId: record.id }),
    record,
    actor.id,
  );
  const originalCounts = (
    await sim.owner.query('SELECT count(*) count FROM receipts WHERE record_id=$1', [record.id])
  ).rows[0];
  const first = confirmRecordExport(
    await reader.read(actor, { recordId: record.id }),
    reviewed,
    true,
  );
  assert.equal(first.status, 'ready');
  assert.deepEqual(
    (await sim.owner.query('SELECT count(*) count FROM receipts WHERE record_id=$1', [record.id]))
      .rows[0],
    originalCounts,
  );
  await sim.command(actor, record.id, 'save_draft', {
    ...record.data,
    livelihood: 'Invented updated saved work',
  });
  const changed = confirmRecordExport(
    await reader.read(actor, { recordId: record.id }),
    reviewed,
    true,
  );
  assert.equal(changed.status, 'changed');
  if (changed.status !== 'changed') throw Error('Expected explicit renewed review');
  assert.equal(changed.review.record.version, 2);
  const accepted = confirmRecordExport(
    await reader.read(actor, { recordId: record.id }),
    changed.review,
    true,
  );
  assert.equal(accepted.status, 'ready');
  if (accepted.status !== 'ready') throw Error('Expected reviewed bytes');
  assert.equal(JSON.parse(accepted.content).record.data.livelihood, 'Invented updated saved work');
  const outsider = await sim.person();
  await assert.rejects(reader.read(outsider, { recordId: record.id }), /not found|accessible/i);
  await sim.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    record.id,
  ]);
  await assert.rejects(
    reader.read(await sim.actor(actor.id), { recordId: record.id }),
    /not found|accessible/i,
  );
  assert.equal(
    (await sim.owner.query('SELECT count(*) count FROM receipts WHERE record_id=$1', [record.id]))
      .rows[0].count,
    '2',
  );
  console.log(
    'Record export: current reads, renewed version consent, no mutation, outsider and revoked-access denial passed.',
  );
} finally {
  await sim.close();
}
