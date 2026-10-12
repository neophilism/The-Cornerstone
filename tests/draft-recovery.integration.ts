import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Simulation } from './helpers/simulation.js';
import { RecordReader } from '../apps/api/src/records.js';
import {
  currentDraft,
  draftSaveResult,
  resolveDraft,
  reviewDraft,
} from '../packages/ui/src/draft-review.js';
const sim = await new Simulation().connect();
try {
  const actor = await sim.person(),
    outsider = await sim.person();
  const input = {
    actionDescription: 'Invented original action',
    livelihood: 'Invented original work',
    lossDescription: 'Invented original loss',
  };
  const original = await sim.create(actor, 'dossier', 'Invented concurrent draft recovery', input);
  const fields = Object.keys(input);
  const mine = { ...input, actionDescription: 'Invented local action' };
  const theirs = { ...input, livelihood: 'Invented other saved work' };
  const request = (value: typeof input) => ({
    recordId: original.id,
    action: 'save_draft',
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    input: value,
  });
  const commands = [request(mine), request(theirs)];
  const raced = await Promise.allSettled(
    commands.map((command) => sim.program.command(actor, command)),
  );
  const winnerIndex = raced.findIndex((result) => result.status === 'fulfilled');
  const loserIndex = winnerIndex === 0 ? 1 : 0;
  assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(raced.filter((result) => result.status === 'rejected').length, 1);
  const loser = raced[loserIndex]!;
  assert.equal(loser.status, 'rejected');
  if (loser.status === 'rejected') assert.equal(loser.reason.code, 'STALE_VERSION');
  const reader = new RecordReader(sim.store);
  const snapshot = currentDraft(await reader.read(actor, { recordId: original.id }), original);
  assert.equal(snapshot.editable, true);
  assert.equal(snapshot.record.version, 2);
  const review = reviewDraft(
    fields,
    original.data,
    commands[loserIndex]!.input,
    snapshot.record.data,
  );
  assert.equal(review.conflicts.length, 0);
  const merged = resolveDraft(review, {});
  assert.equal(merged.actionDescription, mine.actionDescription);
  assert.equal(merged.livelihood, theirs.livelihood);
  // Simulate a save that committed but whose response never reached the client.
  const retryRequest = {
    ...commands[loserIndex]!,
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
    input: merged,
  };
  const accepted = await sim.program.command(actor, retryRequest);
  const acceptedResult = draftSaveResult(accepted, retryRequest, snapshot.record);
  assert.equal(acceptedResult.record.version, 3);
  const [retryOne, retryTwo] = await Promise.all([
    sim.program.command(actor, retryRequest),
    sim.program.command(actor, retryRequest),
  ]);
  assert.deepEqual(retryOne, accepted);
  assert.deepEqual(retryTwo, accepted);
  assert.equal((await sim.get(actor, original.id))!.version, 3);
  assert.equal(
    (
      await sim.owner.query('SELECT count(*) n FROM receipts WHERE record_id=$1 AND action=$2', [
        original.id,
        'save_draft',
      ])
    ).rows[0].n,
    '2',
  );
  assert.equal(
    (
      await sim.owner.query('SELECT count(*) n FROM case_versions WHERE record_id=$1', [
        original.id,
      ])
    ).rows[0].n,
    '3',
  );
  await assert.rejects(
    sim.program.command(actor, {
      ...retryRequest,
      input: { ...merged, livelihood: 'Different bytes with old key' },
    }),
    /different command/,
  );
  const later = await sim.command(actor, original.id, 'save_draft', {
    ...merged,
    livelihood: 'Later independently saved work',
  });
  assert.equal(later.record!.version, 4);
  const historical = draftSaveResult(
    await sim.program.command(actor, retryRequest),
    retryRequest,
    snapshot.record,
  );
  assert.deepEqual(historical, acceptedResult);
  assert.equal((await sim.get(actor, original.id))!.version, 4);
  await assert.rejects(reader.read(outsider, { recordId: original.id }), /not found|accessible/i);
  await assert.rejects(
    sim.program.command(outsider, retryRequest),
    /not found|permission|accessible/i,
  );
  await sim.command(actor, original.id, 'mark_ready');
  assert.equal(
    currentDraft(await reader.read(actor, { recordId: original.id }), original).editable,
    false,
  );
  await sim.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    actor.id,
    original.id,
  ]);
  await assert.rejects(
    reader.read(await sim.actor(actor.id), { recordId: original.id }),
    /not found|accessible/i,
  );
  await assert.rejects(
    sim.program.command(await sim.actor(actor.id), retryRequest),
    /not found|permission|accessible|conflict/i,
  );
  console.log(
    'Draft recovery: actual concurrent stale rejection, reviewed rebase, exact repeated/historical receipts, immutable counts, outsider and current-conflict denial passed.',
  );
} finally {
  await sim.close();
}
