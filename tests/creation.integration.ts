import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import { RecordReader } from '../apps/api/src/records.js';
import { prepareCreation, creationRequest, creationResult } from '../packages/ui/src/creation.js';
const sim = await new Simulation().connect();
try {
  const actor = await sim.person();
  const attempt = prepareCreation(
    {
      kind: 'dossier',
      title: 'Invented recovered creation',
      idempotencyKey: randomUUID(),
      input: {
        actionDescription: 'Invented original action',
        livelihood: 'Invented original work',
        lossDescription: 'Invented original loss',
      },
    },
    actor,
  );
  // Two concurrent retries of the same intent must return one initial record and receipt.
  const results = await Promise.all([
    sim.program.create(actor, creationRequest(attempt)),
    sim.program.create(actor, creationRequest(attempt)),
  ]);
  const accepted = creationResult(results[0], attempt);
  assert.deepEqual(creationResult(results[1], attempt), accepted);
  const recordId = accepted.record.id;
  async function counts() {
    return (
      await sim.owner.query(
        `SELECT
      (SELECT count(*) FROM case_records WHERE owner_id=$1) records,
      (SELECT count(*) FROM case_versions WHERE record_id=$2) versions,
      (SELECT count(*) FROM receipts WHERE record_id=$2) receipts,
      (SELECT count(*) FROM outbox WHERE record_id=$2) events`,
        [actor.id, recordId],
      )
    ).rows[0];
  }
  assert.deepEqual(await counts(), { records: '1', versions: '1', receipts: '1', events: '1' });
  assert.deepEqual(
    creationResult(await sim.program.create(actor, creationRequest(attempt)), attempt),
    accepted,
  );
  assert.deepEqual(await counts(), { records: '1', versions: '1', receipts: '1', events: '1' });
  await assert.rejects(
    sim.program.create(actor, {
      ...creationRequest(attempt),
      title: 'Different intent with reused key',
    }),
    /different command/,
  );
  await assert.rejects(
    sim.program.create(actor, {
      ...creationRequest(attempt),
      input: { ...creationRequest(attempt).input, livelihood: 'Changed after original request' },
    }),
    /different command/,
  );
  await sim.command(actor, recordId, 'save_draft', {
    ...creationRequest(attempt).input,
    livelihood: 'Later independently saved work',
  });
  const later = await counts();
  assert.deepEqual(later, { records: '1', versions: '2', receipts: '2', events: '2' });
  // Recovery returns the original creation, not a false assertion of the latest version.
  assert.deepEqual(
    creationResult(await sim.program.create(actor, creationRequest(attempt)), attempt),
    accepted,
  );
  assert.equal((await sim.get(actor, recordId))!.version, 2);
  assert.deepEqual(await counts(), later);
  const outsider = await sim.person();
  await assert.rejects(
    new RecordReader(sim.store).read(outsider, { recordId }),
    /not found|accessible/i,
  );
  await sim.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    recordId,
  ]);
  // An old creation key never restores revoked current access or writes a second record.
  await assert.rejects(
    sim.program.create(await sim.actor(actor.id), creationRequest(attempt)),
    /not found|accessible|conflict/i,
  );
  assert.deepEqual(await counts(), later);
  console.log(
    'Creation recovery: concurrent exact retries, immutable counts, changed-intent denial, historical receipt and current-access denial passed.',
  );
} finally {
  await sim.close();
}
