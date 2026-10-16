import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import { ReceiptReader } from '../apps/api/src/receipts.js';
import { DraftAccessService } from '../apps/api/src/access.js';
import { reviewReceiptExport, confirmReceiptExport } from '../packages/ui/src/receipt-export.js';
const sim = await new Simulation().connect();
try {
  const actor = await sim.person(),
    outsider = await sim.person();
  const created = await sim.program.create(actor, {
    kind: 'dossier',
    title: 'Invented receipt export',
    input: {
      actionDescription: 'Invented action',
      livelihood: 'Invented work',
      lossDescription: 'Invented loss',
    },
    idempotencyKey: randomUUID(),
  });
  const { record, receipt } = created;
  const reader = new ReceiptReader(sim.store);
  const reviewed = reviewReceiptExport(
    await reader.read(actor, { receiptId: receipt.id }),
    receipt,
  );
  assert.deepEqual(
    JSON.parse(
      confirmReceiptExport(await reader.read(actor, { receiptId: receipt.id }), reviewed, true),
    ).receipt,
    receipt,
  );
  await assert.rejects(reader.read(outsider, { receiptId: receipt.id }), /not found|accessible/i);
  await assert.rejects(reader.read(actor, { receiptId: randomUUID() }), /not found|accessible/i);
  await assert.rejects(reader.read(actor, { receiptId: receipt.id, recordId: record.id }));
  const access = new DraftAccessService(sim.store, 'simulation', 'simulation');
  await access.grant(actor, {
    recordId: record.id,
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    subjectId: outsider.id,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    allowDraftEdits: true,
    consent: true,
  });
  assert.ok(await sim.get(outsider, record.id));
  // Being able to read a record does not grant the receipt author's download endpoint.
  await assert.rejects(reader.read(outsider, { receiptId: receipt.id }), /not found|accessible/i);
  const result = await reader.read(actor, { receiptId: receipt.id });
  assert.deepEqual(Object.keys(result), ['receipt']);
  assert.equal(result.receipt.version, 1);
  assert.equal((await sim.get(actor, record.id))!.version, 2);
  assert.equal(confirmReceiptExport(result, reviewed, true), reviewed.content);
  await sim.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    record.id,
  ]);
  await assert.rejects(
    reader.read(await sim.actor(actor.id), { receiptId: receipt.id }),
    /not found|accessible/i,
  );
  assert.equal(
    (await sim.owner.query('SELECT count(*) n FROM receipts WHERE record_id=$1', [record.id]))
      .rows[0].n,
    '2',
  );
  console.log(
    'Receipt export: own historical receipt only, fresh access, read-only projection, outsider/shared-reader/conflicted-author denial passed.',
  );
} finally {
  await sim.close();
}
