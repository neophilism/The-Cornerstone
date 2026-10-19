import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { digest } from '@cornerstone/security';
import { ProgramService } from '../apps/api/src/service.js';
import { Simulation, findings } from './helpers/simulation.js';
import {
  claimFixture,
  closeAssociationFixture,
  eventFixture,
  openAssociationFixture,
  respondFixture,
  survivingRequestFixture,
} from './helpers/claim-fixtures.js';
import {
  deceasedFilingFixture,
  eligibilityPreparation,
  standingFindings,
} from './helpers/deceased-filings.js';

const w = await new Simulation().connect();
async function counts(id: string) {
  return (
    await w.owner.query(
      `SELECT
       (SELECT count(*)::int FROM case_versions WHERE record_id=$1) AS versions,
       (SELECT count(*)::int FROM receipts WHERE record_id=$1) AS receipts,
       (SELECT count(*)::int FROM audit_events WHERE record_id=$1) AS audits,
       (SELECT count(*)::int FROM outbox WHERE record_id=$1) AS outbox`,
      [id],
    )
  ).rows[0];
}
async function open(actor: Actor, packet: CaseRecord, event: CaseRecord) {
  const result = await w.command(actor, packet, 'open_claim', eligibilityPreparation(event));
  return (await w.get(actor, String(result.record.data['openedClaimId'])))!;
}
try {
  const applicant = await w.person(),
    worker = await w.person(),
    outsider = await w.person(),
    labor = await w.persona('labor');
  const event = await eventFixture(w, applicant, labor);
  const unrelated = await w.create(worker, 'dossier', 'Invented unrelated worker file', {
    actionDescription: findings,
    livelihood: findings,
    lossDescription: findings,
  });
  const packet = await deceasedFilingFixture(w, applicant, worker, labor);
  const baseline = await counts(packet.record.id);
  await assert.rejects(
    w.command(applicant, packet.record, 'open_claim', eligibilityPreparation(event)),
    {
      code: 'INVALID_TRANSITION',
    },
  );
  await assert.rejects(
    w.command(labor, packet.record, 'approve', { ...packet.input, deathEstablished: false }),
    {
      code: 'REQUIRED_FINDING',
    },
  );
  assert.deepEqual(
    await counts(packet.record.id),
    baseline,
    'Failed standing decisions are atomic',
  );
  assert.equal(await w.get(outsider, packet.record.id), null);
  assert.equal(
    await w.get(applicant, unrelated.id),
    null,
    'A worker reference grants no file access',
  );
  await assert.rejects(
    w.store.transaction(applicant, (tx) =>
      tx.query('UPDATE deceased_filing_reviews SET worker_id=$1 WHERE request_id=$2', [
        outsider.id,
        packet.record.id,
      ]),
    ),
    { code: '42501' },
  );

  const approval = {
    recordId: packet.record.id,
    expectedVersion: packet.record.version,
    action: 'approve',
    input: packet.input,
    idempotencyKey: randomUUID(),
  };
  const approved = await w.program.command(await w.actor(labor.id), approval);
  const approvedReplay = await w.program.command(await w.actor(labor.id), approval);
  assert.equal(approved.receipt.id, approvedReplay.receipt.id);
  assert.equal(approved.record.state, 'approved');
  assert.equal(approved.receipt.authorityStatus, 'simulation');
  assert.equal(
    (
      await w.owner.query(
        'SELECT count(*)::int AS n FROM deceased_filing_claims WHERE request_id=$1',
        [packet.record.id],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    w.store.transaction(labor, (tx) =>
      tx.query('SELECT * FROM simulation_deceased_open_context($1)', [packet.record.id]),
    ),
    /DECEASED_FILING_PERSONAL/,
  );
  await assert.rejects(
    w.command(applicant, packet.record, 'open_claim', {
      ...eligibilityPreparation(event),
      eventId: unrelated.id,
    }),
    { code: 'RELATED_RECORD' },
  );
  assert.equal((await w.get(applicant, packet.record.id))!.state, 'approved');

  const opening = {
    recordId: packet.record.id,
    expectedVersion: approved.record.version,
    action: 'open_claim',
    input: eligibilityPreparation(event),
    idempotencyKey: randomUUID(),
  };
  const opened = await w.program.command(await w.actor(applicant.id), opening);
  const replay = await w.program.command(await w.actor(applicant.id), opening);
  assert.equal(replay.receipt.id, opened.receipt.id);
  assert.equal(replay.record.data['openedClaimId'], opened.record.data['openedClaimId']);
  const claimId = String(opened.record.data['openedClaimId']);
  const claim = (await w.get(applicant, claimId))!;
  assert.equal(claim.state, 'draft');
  assert.equal(claim.version, 1);
  assert.equal(claim.ownerId, applicant.id);
  assert.equal(claim.data['deceasedFilingId'], packet.record.id);
  assert.equal(
    (claim.data['claimControl'] as Record<string, unknown>)['originalWorkerId'],
    worker.id,
  );
  assert.equal(
    (await w.evidence.list(applicant, claimId)).evidence.length,
    0,
    'Standing evidence is not substituted for worker injury evidence',
  );
  assert.equal(
    await w.get(labor, claimId),
    null,
    'Standing review does not silently assign the new private draft',
  );
  assert.equal(await w.get(worker, claimId), null);
  assert.equal(await w.get(outsider, claimId), null);
  assert.equal(await w.get(applicant, unrelated.id), null);
  assert.equal(
    (
      await w.owner.query(
        'SELECT count(*)::int AS n FROM deceased_filing_claims WHERE request_id=$1',
        [packet.record.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await w.owner.query('SELECT count(*)::int AS n FROM founding_units WHERE claim_id=$1', [
        claimId,
      ])
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    w.command(applicant, packet.record, 'open_claim', eligibilityPreparation(event)),
    { code: 'INVALID_TRANSITION' },
  );
  await assert.rejects(
    w.command(applicant, claim, 'save_draft', {
      ...eligibilityPreparation(event),
      deceasedFilingId: randomUUID(),
    }),
    { code: 'UNKNOWN_FIELD' },
  );
  await w.command(applicant, claim, 'save_draft', {
    ...eligibilityPreparation(event),
    earnedIncomeShare: 0.1,
    annualHours: 10,
  });
  const evidence = await w.attach(applicant, claim);
  await w.command(applicant, claim, 'submit', { attested: true });
  await w.command(labor, claim, 'begin_review');
  await assert.rejects(
    w.command(labor, claim, 'find_eligible', {
      directInjuryProven: true,
      reasons: findings,
      evidenceIds: [evidence],
    }),
    { code: 'PRINCIPAL_LIVELIHOOD' },
  );
  assert.equal(
    (await w.get(applicant, claimId))!.state,
    'review',
    'Standing never supplies eligibility',
  );
  const initialReceipt = (
    await w.owner.query("SELECT * FROM receipts WHERE record_id=$1 AND action='create'", [claimId])
  ).rows[0];
  const historic = await w.store.transaction(applicant, (tx) => w.store.getVersion(tx, claimId, 1));
  assert.equal(
    initialReceipt.digest,
    digest({ record: historic, action: 'create', actorId: applicant.id }),
  );
  await assert.rejects(
    w.create(worker, 'claim', 'Invented duplicate personal claim', eligibilityPreparation(event)),
    { code: 'DECEASED_WORKER_ALREADY_RECORDED' },
  );

  // Current access remains necessary even when the original opening succeeded.
  await w.owner.query('UPDATE actors SET conflicts=array_append(conflicts,$2::uuid) WHERE id=$1', [
    applicant.id,
    packet.record.id,
  ]);
  await assert.rejects(w.program.command(await w.actor(applicant.id), opening), {
    code: 'NOT_FOUND',
  });
  assert.equal(
    (
      await w.owner.query(
        'SELECT count(*)::int AS n FROM deceased_filing_claims WHERE request_id=$1',
        [packet.record.id],
      )
    ).rows[0].n,
    1,
  );

  // Two live reviewed packets for one worker are held; neither applicant wins a race.
  const contestedWorker = await w.person(),
    first = await w.person(),
    second = await w.person();
  const firstPacket = await deceasedFilingFixture(w, first, contestedWorker, labor);
  const secondPacket = await deceasedFilingFixture(w, second, contestedWorker, labor);
  const beforeSecond = await counts(secondPacket.record.id),
    beforeFirst = await counts(firstPacket.record.id);
  const competition = await Promise.allSettled([
    w.command(labor, firstPacket.record, 'approve', firstPacket.input),
    w.command(labor, secondPacket.record, 'approve', secondPacket.input),
  ]);
  assert.equal(competition.filter((result) => result.status === 'fulfilled').length, 0);
  for (const result of competition)
    assert.equal(
      result.status === 'rejected' ? result.reason.code : '',
      'DECEASED_FILING_CONTESTED',
    );
  assert.deepEqual(await counts(firstPacket.record.id), beforeFirst);
  assert.deepEqual(await counts(secondPacket.record.id), beforeSecond);
  assert.equal((await w.get(first, firstPacket.record.id))!.state, 'review');
  assert.equal((await w.get(second, secondPacket.record.id))!.state, 'review');
  // Resolution is a recorded staff decision, not an automatic choice of applicant.
  await w.command(labor, secondPacket.record, 'deny', {
    reasons: findings,
    evidenceIds: secondPacket.input.evidenceIds,
  });
  await w.command(labor, firstPacket.record, 'approve', firstPacket.input);
  await assert.rejects(w.command(labor, secondPacket.record, 'approve', secondPacket.input), {
    code: 'INVALID_TRANSITION',
  });

  // An unused approval can be withdrawn personally without erasing its decision.
  const withdrawnWorker = await w.person(),
    withdrawing = await w.person(),
    replacement = await w.person();
  const unused = await deceasedFilingFixture(w, withdrawing, withdrawnWorker, labor);
  await w.command(labor, unused.record, 'approve', unused.input);
  const replacementPacket = await deceasedFilingFixture(w, replacement, withdrawnWorker, labor);
  await w.command(withdrawing, unused.record, 'withdraw_standing', { reasons: findings });
  assert.equal((await w.get(withdrawing, unused.record.id))!.state, 'withdrawn');
  await assert.rejects(
    w.command(withdrawing, unused.record, 'open_claim', eligibilityPreparation(event)),
    { code: 'INVALID_TRANSITION' },
  );
  await w.command(labor, replacementPacket.record, 'approve', replacementPacket.input);
  assert.equal(
    (
      await w.owner.query(
        'SELECT count(*)::int n FROM deceased_filing_standing WHERE worker_id=$1',
        [withdrawnWorker.id],
      )
    ).rows[0].n,
    2,
    'The prior approval remains in immutable history',
  );
  assert.equal(
    (
      await w.owner.query(
        'SELECT count(*)::int n FROM deceased_filing_withdrawals WHERE worker_id=$1',
        [withdrawnWorker.id],
      )
    ).rows[0].n,
    1,
  );
  const replacementEvent = await eventFixture(w, replacement, labor);
  await open(replacement, replacementPacket.record, replacementEvent);
  await assert.rejects(
    w.command(replacement, replacementPacket.record, 'withdraw_standing', { reasons: findings }),
    { code: 'INVALID_TRANSITION' },
  );

  // A simultaneous ordinary personal claim cannot bypass the worker reservation.
  const racingWorker = await w.person(),
    racingApplicant = await w.person();
  const racingPacket = await deceasedFilingFixture(w, racingApplicant, racingWorker, labor);
  const race = await Promise.allSettled([
    w.command(labor, racingPacket.record, 'approve', racingPacket.input),
    w.create(
      racingWorker,
      'claim',
      'Invented concurrently filed personal claim',
      eligibilityPreparation(event),
    ),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    race.find((result) => result.status === 'rejected')?.reason.code,
    'DECEASED_WORKER_ALREADY_RECORDED',
  );

  // A historical claim already assigned to a successor is still the original worker's claim.
  const priorWorker = await w.person(),
    priorHolder = await w.person(),
    newApplicant = await w.person();
  const priorClaim = await claimFixture(w, priorWorker, labor, event);
  const survival = await survivingRequestFixture(w, priorHolder, labor, priorClaim.record);
  await w.command(labor, survival.record, 'approve', survival.input);
  const duplicatePacket = await deceasedFilingFixture(w, newApplicant, priorWorker, labor);
  await assert.rejects(w.command(labor, duplicatePacket.record, 'approve', duplicatePacket.input), {
    code: 'DECEASED_WORKER_ALREADY_RECORDED',
  });

  // Corrections bind a new review; stale worker metadata cannot grant standing.
  const correcting = await w.person(),
    oldWorker = await w.person(),
    newWorker = await w.person();
  const corrected = await deceasedFilingFixture(w, correcting, oldWorker, labor);
  await w.command(labor, corrected.record, 'request_changes', { reasons: findings });
  await w.command(correcting, corrected.record, 'revise_request');
  const changed = await w.command(correcting, corrected.record, 'save_draft', {
    workerId: newWorker.id,
    capacity: 'estate_representative',
    chain: findings,
    evidenceIds: corrected.input.evidenceIds,
  });
  assert.equal(changed.record.data['reviewedFiling'], undefined);
  await w.command(correcting, corrected.record, 'submit', {
    attested: true,
    rightsAcknowledged: true,
  });
  await w.command(labor, corrected.record, 'begin_review');
  await w.command(labor, corrected.record, 'approve', corrected.input);
  assert.equal(
    (
      await w.owner.query(
        'SELECT worker_id,capacity FROM deceased_filing_standing WHERE request_id=$1',
        [corrected.record.id],
      )
    ).rows[0].worker_id,
    newWorker.id,
  );

  // The estate's original rights holder continues into an eventual personally accepted roll.
  const estateEvent = await eventFixture(w, correcting, labor);
  const estateClaim = await open(correcting, corrected.record, estateEvent);
  const estateEvidence = await w.attach(correcting, estateClaim);
  await w.command(correcting, estateClaim, 'submit', { attested: true });
  await w.command(labor, estateClaim, 'begin_review');
  await w.command(labor, estateClaim, 'find_eligible', {
    directInjuryProven: true,
    reasons: findings,
    evidenceIds: [estateEvidence],
  });
  const other = await w.person(),
    otherClaim = await claimFixture(w, other, labor, estateEvent);
  const association = await openAssociationFixture(w, correcting, estateEvent, [
    { claimId: estateClaim.id, personId: correcting.id },
    { claimId: otherClaim.record.id, personId: other.id },
  ]);
  await respondFixture(w, correcting, association);
  await respondFixture(w, other, association);
  await closeAssociationFixture(w, labor, association);
  const unit = (
    await w.owner.query(
      'SELECT holder_capacity,rights_holder_id FROM founding_units WHERE claim_id=$1',
      [estateClaim.id],
    )
  ).rows[0];
  assert.equal(unit.holder_capacity, 'estate_representative');
  assert.equal(unit.rights_holder_id, newWorker.id);

  // Invalid identity scope and absent assignment are separate from eligibility.
  const selfPacket = await w.create(outsider, 'deceased_filing', 'Invented invalid self request', {
    workerId: outsider.id,
    capacity: 'designated_successor',
    chain: findings,
  });
  await w.attach(outsider, selfPacket);
  await assert.rejects(
    w.command(outsider, selfPacket, 'submit', { attested: true, rightsAcknowledged: true }),
    { code: 'DECEASED_FILING_PERSONAL' },
  );
  const workerReviewer = await w.person('labor'),
    separateApplicant = await w.person('labor');
  await w.owner.query(
    "UPDATE actors SET roles=array_append(roles,'participant') WHERE id=ANY($1::uuid[])",
    [[workerReviewer.id, separateApplicant.id]],
  );
  const conflicted = await w.create(
    separateApplicant,
    'deceased_filing',
    'Invented worker reviewer conflict',
    {
      workerId: workerReviewer.id,
      capacity: 'designated_successor',
      chain: findings,
    },
  );
  const partyEvidence = await w.attach(separateApplicant, conflicted);
  await w.command(separateApplicant, conflicted, 'submit', {
    attested: true,
    rightsAcknowledged: true,
  });
  const parties = [workerReviewer, separateApplicant];
  for (const party of parties)
    await assert.rejects(w.command(party, conflicted, 'begin_review'), {
      code: 'DECEASED_FILING_SCOPE',
    });
  await w.command(labor, conflicted, 'begin_review');
  const partyReviewBaseline = await counts(conflicted.id);
  const partyFindings = {
    ...standingFindings,
    legalBasis: findings,
    reasons: findings,
    evidenceIds: [partyEvidence],
  };
  for (const party of parties) {
    for (const action of ['request_changes', 'deny'])
      await assert.rejects(
        w.command(party, conflicted, action, {
          reasons: findings,
          ...(action === 'deny' ? { evidenceIds: [partyEvidence] } : {}),
        }),
        { code: 'DECEASED_FILING_SCOPE' },
      );
    await assert.rejects(w.command(party, conflicted, 'approve', partyFindings), {
      code: 'DECEASED_FILING_SCOPE',
    });
  }
  assert.deepEqual(
    await counts(conflicted.id),
    partyReviewBaseline,
    'No party can make a staff decision on their standing packet',
  );
  await w.command(labor, conflicted, 'approve', partyFindings);
  const partyEvent = await eventFixture(w, separateApplicant, labor);
  const partyClaim = await open(separateApplicant, conflicted, partyEvent);
  const partyClaimEvidence = await w.attach(separateApplicant, partyClaim);
  await w.command(separateApplicant, partyClaim, 'submit', { attested: true });
  const partyClaimSubmitted = await counts(partyClaim.id);
  for (const party of parties)
    await assert.rejects(w.command(party, partyClaim, 'begin_review'), {
      code: 'DECEASED_FILING_SCOPE',
    });
  assert.deepEqual(await counts(partyClaim.id), partyClaimSubmitted);
  await w.command(labor, partyClaim, 'begin_review');
  const partyClaimReview = await counts(partyClaim.id);
  const injuryFinding = {
    directInjuryProven: true,
    reasons: findings,
    evidenceIds: [partyClaimEvidence],
  };
  for (const party of parties) {
    await assert.rejects(w.command(party, partyClaim, 'find_eligible', injuryFinding), {
      code: 'DECEASED_FILING_SCOPE',
    });
    await assert.rejects(
      w.command(party, partyClaim, 'deny', {
        reasons: findings,
        evidenceIds: [partyClaimEvidence],
      }),
      { code: 'DECEASED_FILING_SCOPE' },
    );
  }
  assert.deepEqual(
    await counts(partyClaim.id),
    partyClaimReview,
    'Neither original worker nor applicant can adjudicate worker eligibility',
  );
  await w.command(labor, partyClaim, 'find_eligible', injuryFinding);
  const wrongRealmWorker = await w.person();
  await w.owner.query("UPDATE actors SET realm='program' WHERE id=$1", [wrongRealmWorker.id]);
  const crossRealm = await w.create(
    separateApplicant,
    'deceased_filing',
    'Invented cross-realm worker reference',
    {
      workerId: wrongRealmWorker.id,
      capacity: 'estate_representative',
      chain: findings,
    },
  );
  await w.attach(separateApplicant, crossRealm);
  await w.command(separateApplicant, crossRealm, 'submit', {
    attested: true,
    rightsAcknowledged: true,
  });
  await assert.rejects(w.command(labor, crossRealm, 'begin_review'), {
    code: 'DECEASED_FILING_SCOPE',
  });
  const unassigned = await w.person('labor');
  await assert.rejects(
    w.program.command(unassigned, { ...approval, idempotencyKey: randomUUID() }),
    { code: 'NOT_FOUND' },
  );
  await assert.rejects(
    new ProgramService(w.store, 'proposal', 'simulation').create(outsider, {
      kind: 'deceased_filing',
      title: 'Not activated',
      input: {},
      idempotencyKey: randomUUID(),
    }),
    { code: 'PROTECTED_INTAKE_DISABLED' },
  );
  console.log(
    'PASS: receipt-bound standing, personal one-claim creation, separate injury evidence, exact replay, current-access denial, immutable review, contested-standing hold, unused approval withdrawal, and ordinary-claim race, correction rebinding, historical survival detection and estate enrollment.',
  );
} finally {
  await w.close();
}
