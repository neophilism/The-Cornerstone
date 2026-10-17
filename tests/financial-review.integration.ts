import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { FinancialReviewSchema, type Actor, type CaseRecord } from '@cornerstone/contracts';
import { addCalendarDays } from '@cornerstone/domain';
import { RecordReader } from '../apps/api/src/records.js';
import { Simulation } from './helpers/simulation.js';
import {
  attachFinancialEvidence,
  financialReviewFixture,
  financialStaff,
} from './helpers/financial-review-fixture.js';
import { financialSchedule, syntheticTerms } from './helpers/financial-data.js';

const w = await new Simulation().connect();
const reviewInput = {
  disputedAmount: '5.00',
  reasons: 'Invented supported operating-input dispute; method unchanged',
};
const decisionInput = {
  disposition: 'correct',
  schedule: financialSchedule('200.00'),
  reasons: 'Invented hearing supports the corrected operating cash amount',
  judicialReviewRoute:
    'Invented competent court review route; no filing or legal service performed',
};
async function expectCode(task: Promise<unknown>, code: string) {
  await assert.rejects(task, (error: unknown) => (error as { code?: string }).code === code);
}
async function unchanged(member: Actor, original: CaseRecord) {
  assert.deepEqual(await w.get(member, original.id), original);
}
async function capabilities(actor: Actor, recordId: string) {
  return (await new RecordReader(w.store).read(await w.actor(actor.id), { recordId }))
    .capabilities[0]!.actions;
}
async function freshUpload(actor: Actor, record: CaseRecord) {
  return w.evidence.upload(await w.actor(actor.id), {
    recordId: record.id,
    expectedVersion: record.version,
    idempotencyKey: randomUUID(),
    filename: 'invented-late-finance.txt',
    description: 'Invented late attachment',
    base64: Buffer.from('Invented late hearing attachment').toString('base64'),
    attestedSynthetic: true,
  });
}

try {
  const member = await w.person('member'),
    fiscal = await financialStaff(w, 'fiscal'),
    reviewer = await financialStaff(w, 'adjudicator'),
    outsider = await w.person('member');
  const { calculated } = await financialReviewFixture(w, member, fiscal);
  const originalCalculation = calculated.data['calculation'];
  assert.equal((originalCalculation as { statePayment: string }).statePayment, '45.00');
  await expectCode(
    w.command(fiscal, calculated, 'confirm_transfer', {
      transferReference: 'Invented transfer forbidden',
      evidenceIds: [],
    }),
    'TREASURY_ADAPTER_REQUIRED',
  );
  await unchanged(member, calculated);
  await assert.rejects(
    w.store.transaction(outsider, (tx) =>
      tx.query('SELECT simulation_route_financial_review($1,$2)', [
        calculated.id,
        calculated.version,
      ]),
    ),
    /owner.*calculated/i,
  );
  await assert.rejects(
    w.store.transaction(member, (tx) =>
      tx.query('SELECT simulation_route_financial_review($1,$2)', [
        calculated.id,
        calculated.version + 1,
      ]),
    ),
    /owner.*calculated/i,
  );

  // A known routing prerequisite is a definitive rollback, not an uncertain server failure.
  const routing = (await w.owner.query("SELECT * FROM simulation_routing WHERE kind='hearing'"))
    .rows[0]!;
  try {
    await w.owner.query("DELETE FROM simulation_routing WHERE kind='hearing'");
    await expectCode(
      w.command(member, calculated, 'request_review', reviewInput),
      'FINANCIAL_REVIEW_ROUTING_UNAVAILABLE',
    );
    await unchanged(member, calculated);
  } finally {
    await w.owner.query(
      "INSERT INTO simulation_routing(kind,institution_id,roles) VALUES('hearing',$1,$2)",
      [routing.institution_id, routing.roles],
    );
  }
  const possible = (
    await w.owner.query(
      "SELECT id,conflicts FROM actors WHERE realm='simulation' AND institution_id=$1 AND 'adjudicator'=ANY(roles)",
      [routing.institution_id],
    )
  ).rows;
  try {
    await w.owner.query(
      "UPDATE actors SET conflicts=array_append(conflicts,$1) WHERE realm='simulation' AND institution_id=$2 AND 'adjudicator'=ANY(roles)",
      [calculated.id, routing.institution_id],
    );
    await expectCode(
      w.command(member, calculated, 'request_review', reviewInput),
      'FINANCIAL_REVIEW_ROUTING_UNAVAILABLE',
    );
    await unchanged(member, calculated);
  } finally {
    for (const row of possible)
      await w.owner.query('UPDATE actors SET conflicts=$2 WHERE id=$1', [row.id, row.conflicts]);
  }
  const expired = await financialReviewFixture(w, member, fiscal);
  w.day = addCalendarDays(w.today, 61);
  await expectCode(
    w.command(member, expired.calculated, 'request_review', reviewInput),
    'FINANCIAL_REVIEW_DEADLINE',
  );
  await unchanged(member, expired.calculated);
  w.day = addCalendarDays(w.today, 60);
  await w.command(member, expired.calculated, 'request_review', reviewInput);
  w.day = w.today;

  const appealCommand = {
    recordId: calculated.id,
    expectedVersion: calculated.version,
    idempotencyKey: randomUUID(),
    action: 'request_review',
    input: reviewInput,
  };
  const appealed = await w.program.command(await w.actor(member.id), appealCommand);
  const pending = appealed.record!;
  assert.equal(pending.state, 'review_requested');
  assert.equal(pending.institutionId, reviewer.institutionId);
  assert.equal(await w.get(fiscal, pending.id), null);
  assert.equal(await w.get(outsider, pending.id), null);
  assert.ok((await w.actor(reviewer.id)).assignments.includes(pending.id));
  assert.ok((await capabilities(reviewer, pending.id)).includes('begin_calculation_review'));

  // Even a privileged owner with adjudicator and member roles cannot decide its own appeal.
  await w.owner.query(
    "UPDATE actors SET roles=ARRAY['member','adjudicator'],assurance='privileged',institution_id=$2,assignments=array_append(assignments,$3) WHERE id=$1",
    [member.id, reviewer.institutionId, pending.id],
  );
  const hearingInput = {
    hearingDate: w.today,
    noticeReference: 'Invented independent hearing notice; no legal service',
  };
  await expectCode(
    w.command(member, pending, 'begin_calculation_review', hearingInput),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
  );
  assert.ok(!(await capabilities(member, pending.id)).includes('begin_calculation_review'));
  const ownerEvidence = await attachFinancialEvidence(w, member, pending.id);
  await w.command(reviewer, pending, 'begin_calculation_review', hearingInput);
  const reviewerEvidence = await attachFinancialEvidence(w, reviewer, pending.id);
  const ready = (await w.get(member, pending.id))!;
  await expectCode(
    w.command(member, ready, 'record_calculation_hearing', {
      hearingRecord: 'Invented forbidden self-hearing',
      evidenceIds: [ownerEvidence],
    }),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
  );
  await unchanged(member, ready);

  const cachedReviewer = await w.actor(reviewer.id);
  await w.owner.query("UPDATE actors SET roles=ARRAY['member'] WHERE id=$1", [reviewer.id]);
  await expectCode(
    w.program.command(cachedReviewer, {
      recordId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: randomUUID(),
      action: 'record_calculation_hearing',
      input: { hearingRecord: 'Invented stale role request', evidenceIds: [ownerEvidence] },
    }),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
  );
  await expectCode(
    w.evidence.upload(cachedReviewer, {
      recordId: ready.id,
      expectedVersion: ready.version,
      idempotencyKey: randomUUID(),
      filename: 'invented-stale-role.txt',
      description: 'Invented stale-role write',
      base64: Buffer.from('Invented stale role attachment').toString('base64'),
      attestedSynthetic: true,
    }),
    'RECORD_PERMISSION',
  );
  await unchanged(member, ready);
  await w.owner.query("UPDATE actors SET roles=ARRAY['adjudicator'] WHERE id=$1", [reviewer.id]);

  // Former calculation actors remain excluded even after moving to the review institution.
  await w.owner.query(
    "UPDATE actors SET roles=ARRAY['fiscal','adjudicator'],institution_id=$2 WHERE id=$1",
    [fiscal.id, reviewer.institutionId],
  );
  await expectCode(
    w.command(fiscal, ready, 'record_calculation_hearing', {
      hearingRecord: 'Invented prior-calculator self-review',
      evidenceIds: [ownerEvidence],
    }),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
  );
  assert.ok(!(await capabilities(fiscal, ready.id)).includes('record_calculation_hearing'));

  // Every evidence operation and adjudication reads current assignment/conflict context.
  await w.owner.query('UPDATE actors SET conflicts=array_append(conflicts,$2) WHERE id=$1', [
    reviewer.id,
    ready.id,
  ]);
  assert.equal(await w.get(reviewer, ready.id), null);
  await assert.rejects(w.evidence.list(await w.actor(reviewer.id), ready.id), /not found/i);
  await assert.rejects(
    w.evidence.download(await w.actor(reviewer.id), ownerEvidence),
    /not found/i,
  );
  await assert.rejects(freshUpload(reviewer, ready), /not found/i);
  await w.owner.query('UPDATE actors SET conflicts=array_remove(conflicts,$2) WHERE id=$1', [
    reviewer.id,
    ready.id,
  ]);
  const hearingCommand = {
    recordId: ready.id,
    expectedVersion: ready.version,
    idempotencyKey: randomUUID(),
    action: 'record_calculation_hearing',
    input: {
      hearingRecord: 'Invented hearing considered competing receipts and the unchanged method',
      evidenceIds: [reviewerEvidence, ownerEvidence],
    },
  };
  const heard = await w.program.command(await w.actor(reviewer.id), hearingCommand);
  const closed = heard.record!;
  const frozen = FinancialReviewSchema.parse(closed.data['financialReview']);
  assert.equal(frozen.hearingRecord!.recordVersion, closed.version);
  assert.equal(frozen.hearingRecord!.evidence.length, 2);
  assert.equal(closed.state, 'calculation_heard');
  assert.ok(!(await capabilities(member, closed.id)).includes('attach_evidence'));
  assert.ok(!(await capabilities(reviewer, closed.id)).includes('attach_evidence'));
  await expectCode(freshUpload(member, closed), 'EVIDENCE_STAGE');
  await expectCode(freshUpload(reviewer, closed), 'EVIDENCE_STAGE');

  const duplicate = financialSchedule();
  duplicate.costs.push({ ...duplicate.costs[0]!, id: 'invented-duplicate-source' });
  await assert.rejects(
    w.command(reviewer, closed, 'decide_calculation_review', {
      ...decisionInput,
      schedule: duplicate,
    }),
    /cannot be deducted again/,
  );
  await unchanged(member, closed);
  assert.deepEqual(closed.data['calculation'], originalCalculation);
  await expectCode(
    w.command(member, closed, 'decide_calculation_review', decisionInput),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
  );

  // A changed validated evidence revision cannot silently replace the hearing basis.
  const checkedAt = (
    await w.owner.query('SELECT checked_at FROM evidence_objects WHERE id=$1', [ownerEvidence])
  ).rows[0]!.checked_at;
  try {
    await w.owner.query(
      "UPDATE evidence_objects SET checked_at=checked_at+interval '1 second' WHERE id=$1",
      [ownerEvidence],
    );
    await expectCode(
      w.command(reviewer, closed, 'decide_calculation_review', decisionInput),
      'FINANCIAL_HEARING_BASIS_MISMATCH',
    );
    await unchanged(member, closed);
  } finally {
    await w.owner.query('UPDATE evidence_objects SET checked_at=$2 WHERE id=$1', [
      ownerEvidence,
      checkedAt,
    ]);
  }
  const decisionCommand = {
    recordId: closed.id,
    expectedVersion: closed.version,
    idempotencyKey: randomUUID(),
    action: 'decide_calculation_review',
    input: decisionInput,
  };
  const results = await Promise.all([
    w.program.command(await w.actor(reviewer.id), decisionCommand),
    w.program.command(await w.actor(reviewer.id), decisionCommand),
  ]);
  assert.deepEqual(results[0], results[1]);
  const decided = results[0]!.record!,
    result = FinancialReviewSchema.parse(decided.data['financialReview']);
  assert.equal(decided.state, 'review_decided');
  assert.equal(result.decision!.reviewedStatePayment, '40.00');
  assert.equal(result.decision!.adjustment, '-5.00');
  assert.deepEqual(result.originalCalculation, originalCalculation);
  assert.deepEqual(result.basis.terms, syntheticTerms);
  assert.deepEqual(result.hearingRecord, frozen.hearingRecord);
  assert.equal(result.decision!.evidenceDigest, frozen.hearingRecord!.evidenceDigest);
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int n FROM receipts WHERE record_id=$1 AND action='decide_calculation_review'",
        [decided.id],
      )
    ).rows[0]!.n,
    1,
  );
  assert.deepEqual(await w.program.command(await w.actor(member.id), appealCommand), appealed);
  assert.deepEqual(await w.program.command(await w.actor(reviewer.id), hearingCommand), heard);
  await expectCode(freshUpload(member, decided), 'EVIDENCE_STAGE');
  assert.ok((await w.evidence.download(await w.actor(member.id), ownerEvidence)).bytes.length);

  await w.owner.query('UPDATE actors SET assignments=array_remove(assignments,$2) WHERE id=$1', [
    reviewer.id,
    decided.id,
  ]);
  assert.equal(await w.get(reviewer, decided.id), null);
  await assert.rejects(
    w.program.command(await w.actor(reviewer.id), decisionCommand),
    /not found|accessible/i,
  );
  await assert.rejects(w.evidence.list(await w.actor(reviewer.id), decided.id), /not found/i);
  await assert.rejects(
    w.evidence.download(await w.actor(reviewer.id), ownerEvidence),
    /not found/i,
  );
  assert.deepEqual(await w.get(member, decided.id), decided);
  console.log(
    'PASS financial appeal: independent routing, definitive prerequisite rollback, inclusive deadline, fresh authorization, mixed-role/prior-actor exclusion, frozen hearing evidence, failed-decision rollback, exact historical receipts and unchanged rate/method. No transfer or legal service executed.',
  );
} finally {
  await w.close();
}
