import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { addCalendarDays } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { DraftAccessService } from '../apps/api/src/access.js';
import { Simulation, findings } from './helpers/simulation.js';
import {
  eventFixture,
  claimFixture,
  openAssociationFixture,
  respondFixture,
  closeAssociationFixture,
  survivingRequestFixture,
} from './helpers/claim-fixtures.js';

const w = await new Simulation().connect();
try {
  const worker = await w.person(),
    other = await w.person(),
    candidate = await w.person(),
    competitor = await w.person(),
    delegate = await w.person(),
    labor = await w.person('labor');
  const event = await eventFixture(w, worker, labor);
  const original = await claimFixture(w, worker, labor, event);
  const unrelated = await claimFixture(w, worker, labor, event);
  const otherClaim = await claimFixture(w, other, labor, event);
  const access = new DraftAccessService(w.store, 'simulation', 'simulation');
  await access.grant(await w.actor(worker.id), {
    recordId: original.record.id,
    expectedVersion: original.record.version,
    idempotencyKey: randomUUID(),
    subjectId: delegate.id,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    allowDraftEdits: false,
    consent: true,
  });
  const before = (await w.get(worker, original.record.id))!;
  const oldReceipt = (
    await w.owner.query('SELECT * FROM receipts WHERE record_id=$1 AND version=$2', [
      before.id,
      before.version,
    ])
  ).rows[0];
  const oldCipher = (
    await w.owner.query(
      'SELECT payload_cipher FROM case_versions WHERE record_id=$1 AND version=$2',
      [before.id, before.version],
    )
  ).rows[0].payload_cipher;
  const oldCohort = await openAssociationFixture(w, worker, event, [
    { claimId: before.id, personId: worker.id },
    { claimId: otherClaim.record.id, personId: other.id },
  ]);
  await respondFixture(w, worker, oldCohort);
  await respondFixture(w, other, oldCohort);
  const request = await survivingRequestFixture(w, candidate, labor, before);
  const competing = await survivingRequestFixture(w, competitor, labor, before);
  assert.equal(
    await w.get(candidate, before.id),
    null,
    'a reference and submitted request grant no claim access',
  );
  for (const key of [
    'deathEstablished',
    'identityEstablished',
    'undivided',
    'caseAccessNecessary',
    'eligibilitySeparate',
  ])
    await assert.rejects(
      w.command(labor, request.record, 'approve', { ...request.input, [key]: false }),
    );
  await assert.rejects(
    w.command(labor, request.record, 'approve', { ...request.input, evidenceIds: [randomUUID()] }),
  );
  await assert.rejects(
    w.store.transaction(await w.actor(worker.id), (tx) =>
      tx.query('UPDATE case_records SET owner_id=$2 WHERE id=$1', [before.id, candidate.id]),
    ),
    /CASE_OWNER_CHANGE_REQUIRES_SURVIVAL_DECISION/,
  );
  await w.owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    labor.id,
    before.id,
  ]);
  await assert.rejects(w.command(labor, request.record, 'approve', request.input));
  await w.owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [labor.id]);
  // Separate live reviewed successor requests must not be decided by race timing.
  for (const packet of [request, competing])
    await assert.rejects(w.command(labor, packet.record, 'approve', packet.input), {
      code: 'CLAIM_SURVIVAL_CONTESTED',
    });
  assert.equal((await w.get(worker, before.id))!.ownerId, worker.id);
  for (const packet of [request, competing]) {
    assert.equal((await w.get(labor, packet.record.id))!.version, packet.record.version);
    assert.equal(
      (
        await w.owner.query(
          "SELECT count(*)::int n FROM receipts WHERE record_id=$1 AND action='approve'",
          [packet.record.id],
        )
      ).rows[0].n,
      0,
    );
  }
  await w.command(labor, competing.record, 'deny', {
    reasons: findings,
    evidenceIds: competing.input.evidenceIds,
  });
  const current = (await w.get(labor, request.record.id))!;
  await w.command(competitor, competing.record, 'request_review', { reasons: findings });
  await assert.rejects(w.command(labor, request.record, 'approve', request.input), {
    code: 'CLAIM_SURVIVAL_CONTESTED',
  });
  await assert.rejects(
    w.command(labor, competing.record, 'reconsider_denial', {
      reasons: findings,
      evidenceIds: competing.input.evidenceIds,
    }),
    { code: 'CLAIM_SURVIVAL_SCOPE' },
  );
  const independent = await w.person('labor');
  await w.owner.query(
    'UPDATE actors SET institution_id=$2, assignments=array_append(array_append(assignments,$3::uuid),$4::uuid) WHERE id=$1',
    [independent.id, current.institutionId, competing.record.id, before.id],
  );
  await w.command(independent, competing.record, 'reconsider_denial', {
    reasons: findings,
    evidenceIds: competing.input.evidenceIds,
  });
  assert.equal((await w.get(competitor, competing.record.id))!.state, 'changes_requested');
  await w.command(competitor, competing.record, 'revise_request');
  assert.equal((await w.get(competitor, competing.record.id))!.state, 'draft');
  const command = {
    recordId: current.id,
    expectedVersion: current.version,
    idempotencyKey: randomUUID(),
    action: 'approve',
    input: request.input,
  };
  const [approved, retried] = await Promise.all([
    w.program.command(await w.actor(labor.id), command),
    w.program.command(await w.actor(labor.id), command),
  ]);
  assert.equal(approved.receipt.id, retried.receipt.id);
  const after = (await w.get(candidate, before.id))!;
  assert.equal(after.id, before.id);
  assert.equal(after.ownerId, candidate.id);
  assert.equal(after.version, before.version + 1);
  assert.equal(after.state, before.state, 'succession does not decide eligibility');
  assert.equal(after.data['eventId'], before.data['eventId']);
  assert.equal((after.data['claimControl'] as any).originalWorkerId, worker.id);
  assert.equal((after.data['claimControl'] as any).approvalReceiptId, approved.receipt.id);
  assert.equal(await w.get(worker, before.id), null);
  assert.equal(
    await w.get(delegate, before.id),
    null,
    'prior delegation cannot survive a new case controller silently',
  );
  assert.ok(
    await w.get(worker, unrelated.record.id),
    'the original account and unrelated files are unchanged',
  );
  assert.equal(await w.get(candidate, unrelated.record.id), null);
  const oldVersion = await w.store.transaction(await w.actor(labor.id), (tx) =>
    w.store.getVersion(tx, before.id, before.version),
  );
  assert.deepEqual(
    oldVersion,
    before,
    'historical ownership and receipt reconstruction remain exact',
  );
  assert.equal(
    digest({ record: oldVersion, action: oldReceipt.action, actorId: oldReceipt.actor_id }),
    oldReceipt.digest,
  );
  assert.deepEqual(
    (
      await w.owner.query(
        'SELECT payload_cipher FROM case_versions WHERE record_id=$1 AND version=$2',
        [before.id, before.version],
      )
    ).rows[0].payload_cipher,
    oldCipher,
  );
  assert.equal(
    (await w.evidence.list(await w.actor(candidate.id), before.id)).evidence[0]!.id,
    original.evidenceId,
    'explicit case authority includes this claim evidence, not other files',
  );
  assert.equal(
    (
      await w.owner.query('SELECT count(*)::int n FROM founding_units WHERE claim_id=$1', [
        before.id,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await w.owner.query('SELECT count(*)::int n FROM claim_successions WHERE claim_id=$1', [
        before.id,
      ])
    ).rows[0].n,
    1,
  );
  await assert.rejects(w.command(labor, competing.record, 'approve', competing.input), {
    code: 'INVALID_TRANSITION',
  });
  assert.equal((await w.get(competitor, competing.record.id))!.state, 'draft');
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int n FROM receipts WHERE record_id=$1 AND action='approve'",
        [competing.record.id],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(respondFixture(w, worker, oldCohort), { code: 'FOUNDING_HOLDER_CHANGED' });
  await assert.rejects(closeAssociationFixture(w, labor, oldCohort), {
    code: 'FOUNDING_CLAIM_REQUIRED',
  });
  await assert.rejects(
    w.owner.query('UPDATE claim_successions SET capacity=capacity WHERE request_id=$1', [
      request.record.id,
    ]),
    /Append-only/,
  );
  await assert.rejects(
    w.owner.query('UPDATE case_version_owners SET owner_id=owner_id WHERE record_id=$1', [
      before.id,
    ]),
    /Append-only/,
  );
  await assert.rejects(
    w.store.transaction(await w.actor(candidate.id), (tx) =>
      tx.query('UPDATE claim_control SET holder_version=holder_version+1 WHERE claim_id=$1', [
        before.id,
      ]),
    ),
    /permission denied/,
  );
  assert.equal((await w.actor(candidate.id)).assurance, 'draft');
  assert.equal(
    (await w.actor(candidate.id)).roles.includes('member'),
    false,
    'a surviving claim alone grants no membership',
  );

  // One estate representative may later be replaced by the final single designation.
  const estate = await w.person(),
    final = await w.person();
  const estateRequest = await survivingRequestFixture(
    w,
    estate,
    labor,
    after,
    'estate_representative',
  );
  await w.command(labor, estateRequest.record, 'approve', estateRequest.input);
  const estateControl = (
    await w.owner.query('SELECT * FROM claim_control WHERE claim_id=$1', [before.id])
  ).rows[0];
  assert.equal(estateControl.original_worker_id, worker.id);
  assert.equal(estateControl.rights_holder_id, candidate.id);
  const finalRequest = await survivingRequestFixture(
    w,
    final,
    labor,
    (await w.get(estate, before.id))!,
    'designated_successor',
    'estate_designation',
  );
  await w.command(labor, finalRequest.record, 'approve', finalRequest.input);
  assert.equal(await w.get(estate, before.id), null);
  assert.equal(
    (await w.owner.query('SELECT holder_version FROM claim_control WHERE claim_id=$1', [before.id]))
      .rows[0].holder_version,
    4,
  );

  // Competing prospective cohorts serialize consent on the same original claim.
  await respondFixture(w, other, oldCohort, 'declined');
  const roll = [
    { claimId: before.id, personId: final.id },
    { claimId: otherClaim.record.id, personId: other.id },
  ];
  const left = await openAssociationFixture(
    w,
    final,
    event,
    roll,
    'Invented first candidate cohort',
  );
  const right = await openAssociationFixture(
    w,
    final,
    event,
    roll,
    'Invented second candidate cohort',
  );
  const choices = await Promise.allSettled([
    respondFixture(w, final, left),
    respondFixture(w, final, right),
  ]);
  assert.equal(choices.filter((r) => r.status === 'fulfilled').length, 1);
  const failure = choices.find((r) => r.status === 'rejected');
  assert.equal(failure?.status === 'rejected' && failure.reason.code, 'COHORT_ALREADY_SELECTED');
  const winner = choices[0]!.status === 'fulfilled' ? left : right;
  const loser = winner.id === left.id ? right : left;
  assert.equal(
    (await w.get(final, loser.id))!.version,
    loser.version,
    'refused consent leaves the other cohort unchanged',
  );
  await w.command(final, winner, 'withdraw_proposal', { rightsPreserved: true, reasons: findings });
  await respondFixture(w, final, loser);
  await respondFixture(w, other, loser);
  await closeAssociationFixture(w, labor, loser);
  const unit = (await w.owner.query('SELECT * FROM founding_units WHERE claim_id=$1', [before.id]))
    .rows[0];
  assert.equal(unit.person_id, final.id);
  assert.equal(unit.holder_capacity, 'designated_successor');
  assert.equal(unit.rights_holder_id, final.id);
  assert.equal(
    (
      await w.owner.query('SELECT count(*)::int n FROM founding_units WHERE claim_id=$1', [
        before.id,
      ])
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    w.command(final, loser, 'withdraw_proposal', { rightsPreserved: true, reasons: findings }),
  );
  await assert.rejects(survivingRequestFixture(w, await w.person(), labor, after), {
    code: 'CLAIM_ALREADY_ENROLLED',
  });

  // Estate capacity and the deceased rights holder survive the initial enrollment.
  const estateWorker = await w.person(),
    estateHolder = await w.person(),
    estateOther = await w.person(),
    unitSuccessor = await w.person();
  const estateClaim = await claimFixture(w, estateWorker, labor, event);
  const estateOtherClaim = await claimFixture(w, estateOther, labor, event);
  const estateEntry = await survivingRequestFixture(
    w,
    estateHolder,
    labor,
    estateClaim.record,
    'estate_representative',
  );
  await w.command(labor, estateEntry.record, 'approve', estateEntry.input);
  const estateRoll = await openAssociationFixture(w, estateHolder, event, [
    { claimId: estateClaim.record.id, personId: estateHolder.id },
    { claimId: estateOtherClaim.record.id, personId: estateOther.id },
  ]);
  await respondFixture(w, estateHolder, estateRoll);
  await respondFixture(w, estateOther, estateRoll);
  await closeAssociationFixture(w, labor, estateRoll);
  const estateUnit = (
    await w.owner.query('SELECT * FROM founding_units WHERE claim_id=$1', [estateClaim.record.id])
  ).rows[0];
  assert.equal(estateUnit.holder_capacity, 'estate_representative');
  assert.equal(estateUnit.rights_holder_id, estateWorker.id);
  const unitRequest = await w.request(
    unitSuccessor,
    estateUnit.id,
    labor,
    'estate_designation',
    'designated_successor',
  );
  await w.command(labor, unitRequest.record, 'approve', unitRequest.input);
  assert.equal(
    (await w.owner.query('SELECT successor_id FROM founding_units WHERE id=$1', [estateUnit.id]))
      .rows[0].successor_id,
    unitSuccessor.id,
  );
  assert.equal(
    await w.get(unitSuccessor, estateClaim.record.id),
    null,
    'post-enrollment unit succession does not silently convey the private claim file',
  );
  assert.ok(await w.get(estateHolder, estateClaim.record.id));

  // A pending claim is still pending after authority changes; eligibility is separately proved.
  const pendingOwner = await w.person(),
    pendingHolder = await w.person();
  const pending = await claimFixture(w, pendingOwner, labor, event, false);
  const pendingRequest = await survivingRequestFixture(w, pendingHolder, labor, pending.record);
  await w.command(labor, pendingRequest.record, 'approve', pendingRequest.input);
  assert.equal((await w.get(pendingHolder, pending.record.id))!.state, 'review');
  await w.command(labor, pending.record, 'find_eligible', pending.input);
  assert.equal((await w.get(pendingHolder, pending.record.id))!.state, 'eligible');

  // Changed evidence/findings, even without a holder change, require a fresh review snapshot.
  const staleOwner = await w.person(),
    staleHolder = await w.person();
  const stale = await claimFixture(w, staleOwner, labor, event, false);
  const staleRequest = await survivingRequestFixture(w, staleHolder, labor, stale.record);
  await w.command(labor, stale.record, 'find_eligible', stale.input);
  await assert.rejects(w.command(labor, staleRequest.record, 'approve', staleRequest.input), {
    code: 'CLAIM_SURVIVAL_STALE',
  });
  await w.command(labor, staleRequest.record, 'request_changes', { reasons: findings });
  await w.command(staleHolder, staleRequest.record, 'revise_request');
  assert.equal(
    (await w.get(staleHolder, staleRequest.record.id))!.data['reviewedClaim'],
    undefined,
  );
  await w.command(staleHolder, staleRequest.record, 'submit', {
    attested: true,
    rightsAcknowledged: true,
  });
  await w.command(labor, staleRequest.record, 'begin_review');
  await w.command(labor, staleRequest.record, 'approve', staleRequest.input);
  assert.equal((await w.get(staleHolder, stale.record.id))!.state, 'eligible');

  // A closing roll and a succession decision cannot both use the old holder.
  const raceOwner = await w.person(),
    raceOther = await w.person(),
    raceTarget = await w.person();
  const raceClaim = await claimFixture(w, raceOwner, labor, event);
  const raceOtherClaim = await claimFixture(w, raceOther, labor, event);
  const raceRoll = await openAssociationFixture(w, raceOwner, event, [
    { claimId: raceClaim.record.id, personId: raceOwner.id },
    { claimId: raceOtherClaim.record.id, personId: raceOther.id },
  ]);
  await respondFixture(w, raceOwner, raceRoll);
  await respondFixture(w, raceOther, raceRoll);
  await w.command(labor, raceRoll, 'begin_review');
  const raceRequest = await survivingRequestFixture(w, raceTarget, labor, raceClaim.record);
  w.day = addCalendarDays(w.today, 181);
  const results = await Promise.allSettled([
    w.command(labor, raceRequest.record, 'approve', raceRequest.input),
    w.command(labor, raceRoll, 'close_roll', {
      pendingClaims: 0,
      equalRights: true,
      voluntary: true,
      reasons: findings,
    }),
  ]);
  w.day = w.today;
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.ok(
    rejected?.status === 'rejected' &&
      ['CLAIM_ALREADY_ENROLLED', 'FOUNDING_CLAIM_REQUIRED'].includes(rejected.reason.code),
  );
  if (results[0]!.status === 'fulfilled') {
    assert.equal((await w.get(raceTarget, raceClaim.record.id))!.ownerId, raceTarget.id);
    assert.equal(
      (
        await w.owner.query('SELECT count(*)::int n FROM founding_units WHERE association_id=$1', [
          raceRoll.id,
        ])
      ).rows[0].n,
      0,
    );
  } else {
    assert.equal((await w.get(raceOwner, raceClaim.record.id))!.ownerId, raceOwner.id);
    assert.equal(
      (
        await w.owner.query('SELECT count(*)::int n FROM founding_units WHERE association_id=$1', [
          raceRoll.id,
        ])
      ).rows[0].n,
      2,
    );
  }
  console.log(
    'PASS: one existing claim, personal survival proof, scoped case access, unchanged eligibility and historical receipts, stale rollback, estate designation, independent consent, and serialized enrollment/holder races.',
  );
} finally {
  await w.close();
}
