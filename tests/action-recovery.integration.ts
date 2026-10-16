import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import { prepareAction, actionRequest, actionResult } from '../packages/ui/src/action-recovery.js';

const sim = await new Simulation().connect();
try {
  const actor = await sim.person(),
    outsider = await sim.person();
  const record = await sim.create(actor, 'dossier', 'Invented non-draft action recovery', {
    actionDescription: 'Invented action',
    livelihood: 'Invented livelihood',
    lossDescription: 'Invented direct loss',
  });
  const intent = prepareAction(
    {
      recordId: record.id,
      action: 'mark_ready',
      expectedVersion: 1,
      input: {},
      idempotencyKey: randomUUID(),
    },
    record,
  );
  const accepted = actionResult(await sim.program.command(actor, actionRequest(intent)), intent);
  assert.equal(accepted.record.version, 2);
  assert.equal(accepted.record.state, 'ready');
  const recovered = await Promise.all([
    sim.program.command(actor, actionRequest(intent)),
    sim.program.command(actor, actionRequest(intent)),
  ]);
  for (const response of recovered) assert.deepEqual(actionResult(response, intent), accepted);
  assert.equal((await sim.get(actor, record.id))!.version, 2);
  assert.equal(
    (
      await sim.owner.query('SELECT count(*) n FROM receipts WHERE record_id=$1 AND action=$2', [
        record.id,
        'mark_ready',
      ])
    ).rows[0].n,
    '1',
  );
  await assert.rejects(
    sim.program.command(actor, { ...actionRequest(intent), input: { changed: true } }),
    /different command/,
  );
  await assert.rejects(
    sim.program.command(outsider, actionRequest(intent)),
    /not found|accessible|permission/i,
  );
  const reopened = await sim.command(actor, record.id, 'reopen');
  assert.equal(reopened.record!.version, 3);
  const historical = actionResult(await sim.program.command(actor, actionRequest(intent)), intent);
  assert.deepEqual(historical, accepted);
  assert.equal((await sim.get(actor, record.id))!.version, 3);
  console.log(
    'Workflow action recovery: concurrent retries produce one receipt; altered intent and outsider denied; replay preserves historical response and newer current state.',
  );
} finally {
  await sim.close();
}
