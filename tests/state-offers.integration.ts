import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { Store } from '@cornerstone/store';
import { type Actor, type CaseRecord, PublishedStateOfferSchema } from '@cornerstone/contracts';
import { addCalendarDays } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { ProgramService } from '../apps/api/src/service.js';
import { StateOfferService } from '../apps/api/src/state-offers.js';
import { RecordReader } from '../apps/api/src/records.js';
import { fixtureKey } from './fixture-key.js';
import { Simulation, findings } from './helpers/simulation.js';
import {
  authorityInput,
  offerInput,
  publicationInput,
  stateStaff,
  submittedAuthority,
  submittedOffer,
  verifiedAuthority,
} from './helpers/state-offer-fixture.js';
import { compactPrerequisites } from './helpers/compact-fixture.js';
import { financialSchedule } from './helpers/financial-data.js';
import { attachFinancialEvidence, financialStaff } from './helpers/financial-review-fixture.js';

const w = await new Simulation().connect();
const catalogue = new StateOfferService(w.store);
async function code(task: Promise<unknown>, expected: string) {
  await assert.rejects(task, (e: unknown) => (e as { code?: string }).code === expected);
}
async function unchanged(actor: Actor, record: CaseRecord) {
  assert.deepEqual(await w.get(actor, record.id), record);
}
function wire(record: CaseRecord, action: string, input: Record<string, unknown> = {}) {
  return {
    recordId: record.id,
    expectedVersion: record.version,
    action,
    input,
    idempotencyKey: randomUUID(),
  };
}
try {
  const state = await stateStaff(w, 'state'),
    reviewer = await stateStaff(w, 'supervisor'),
    member = await w.person('member');
  const officialAuthorityCount = (await w.owner.query('SELECT count(*) FROM authority_records'))
    .rows[0]!.count;
  async function reviewGuards(record: CaseRecord, action: string, input: Record<string, unknown>) {
    const cached = await w.actor(reviewer.id),
      attempt = wire(record, action, input);
    await w.owner.query("UPDATE actors SET roles=ARRAY['support'] WHERE id=$1", [reviewer.id]);
    assert.deepEqual(
      await w.get(reviewer, record.id),
      record,
      'Support retains read access so the current-role guard is reached',
    );
    await code(w.program.command(cached, attempt), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
    await w.owner.query("UPDATE actors SET roles=ARRAY['supervisor','member'] WHERE id=$1", [
      reviewer.id,
    ]);
    await code(w.program.command(cached, attempt), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
    const capabilities = await new RecordReader(w.store).read(await w.actor(reviewer.id), {
      recordId: record.id,
    });
    assert.ok(!capabilities.capabilities[0]!.actions.includes(action));
    await w.owner.query(
      "UPDATE actors SET roles=ARRAY['supervisor'],jurisdiction='OTHER' WHERE id=$1",
      [reviewer.id],
    );
    await code(w.program.command(cached, attempt), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
    await w.owner.query("UPDATE actors SET jurisdiction='EX' WHERE id=$1", [reviewer.id]);
    const retainedRead = randomUUID();
    await w.owner.query(
      "INSERT INTO grants(id,realm,record_id,owner_id,subject_id,permissions,expires_at) VALUES($1,'simulation',$2,$3,$4,ARRAY['read'],now()+interval '1 hour')",
      [retainedRead, record.id, state.id, reviewer.id],
    );
    try {
      await w.owner.query("UPDATE actors SET assurance='verified' WHERE id=$1", [reviewer.id]);
      await unchanged(reviewer, record);
      await code(w.program.command(cached, attempt), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
      await w.owner.query(
        "UPDATE actors SET assurance='privileged',institution_id=$2 WHERE id=$1",
        [reviewer.id, state.institutionId],
      );
      await unchanged(reviewer, record);
      await code(w.program.command(cached, attempt), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
    } finally {
      await w.owner.query(
        "UPDATE actors SET assurance='privileged',institution_id=$2 WHERE id=$1",
        [reviewer.id, reviewer.institutionId],
      );
      await w.owner.query('DELETE FROM grants WHERE id=$1', [retainedRead]);
    }
    await w.owner.query('UPDATE actors SET assignments=array_remove(assignments,$2) WHERE id=$1', [
      reviewer.id,
      record.id,
    ]);
    await code(w.program.command(cached, attempt), 'NOT_FOUND');
    await w.owner.query(
      'UPDATE actors SET assignments=array_append(assignments,$2),conflicts=array_append(conflicts,$2) WHERE id=$1',
      [reviewer.id, record.id],
    );
    await code(w.program.command(cached, attempt), 'NOT_FOUND');
    await w.owner.query('UPDATE actors SET conflicts=array_remove(conflicts,$2) WHERE id=$1', [
      reviewer.id,
      record.id,
    ]);
    await w.owner.query("UPDATE actors SET roles=ARRAY['state','supervisor'] WHERE id=$1", [
      state.id,
    ]);
    await code(w.command(state, record, action, input), 'INDEPENDENT_STATE_REVIEWER_REQUIRED');
    await w.owner.query("UPDATE actors SET roles=ARRAY['state'] WHERE id=$1", [state.id]);
    await unchanged(state, record);
  }

  const prepared = await submittedAuthority(w, state);
  const verificationInput = {
    packetComplete: true,
    reasons: 'INTERNAL authority verification',
    evidenceIds: [prepared.evidenceId],
  };
  await reviewGuards(prepared.record, 'verify', verificationInput);
  const verified = (await w.command(reviewer, prepared.record, 'verify', verificationInput))
    .record!;
  const authorityVersion = verified.version;
  assert.equal(
    (await w.owner.query('SELECT count(*) FROM authority_records')).rows[0]!.count,
    officialAuthorityCount,
    'Synthetic verification creates no production authority',
  );

  // One Rate Act cannot acquire different percentages through competing packet identities.
  const rateAct = 'INVENTED-CONCURRENT-ACT-' + randomUUID(),
    inputA = authorityInput(w.today, rateAct),
    inputB = {
      ...inputA,
      financialTerms: { ...inputA.financialTerms, rate: { numerator: '1', denominator: '10' } },
    };
  const competing = [
    await submittedAuthority(w, state, inputA),
    await submittedAuthority(w, state, inputB),
  ];
  const competingResults = await Promise.allSettled(
    competing.map((p) =>
      w.command(reviewer, p.record, 'verify', {
        packetComplete: true,
        reasons: 'INTERNAL competing verification',
        evidenceIds: [p.evidenceId],
      }),
    ),
  );
  assert.equal(competingResults.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    competingResults.filter(
      (r) => r.status === 'rejected' && r.reason.code === 'STATE_RATE_ACT_CONFLICT',
    ).length,
    1,
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*) FROM receipts WHERE record_id=ANY($1::uuid[]) AND action='verify'",
        [competing.map((p) => p.record.id)],
      )
    ).rows[0]!.count,
    '1',
  );
  const winnerIndex = competingResults.findIndex((r) => r.status === 'fulfilled'),
    winnerTerms = competing[winnerIndex]!.input.financialTerms;
  await unchanged(state, competing[1 - winnerIndex]!.record);
  const equivalent = authorityInput(w.today, rateAct);
  equivalent.financialTerms = {
    ...winnerTerms,
    rate: {
      numerator: String(BigInt(winnerTerms.rate.numerator) * 2n),
      denominator: String(BigInt(winnerTerms.rate.denominator) * 2n),
    },
  };
  await verifiedAuthority(w, state, reviewer, equivalent);

  // Known routing failures are definitive rollbacks and retain the complete editable draft.
  const routeDraft = await w.create(
    state,
    'state_authority',
    'Invented route prerequisite',
    authorityInput(w.today),
  );
  await w.attach(state, routeDraft);
  const beforeRoute = (await w.get(state, routeDraft.id))!;
  const route = (
    await w.owner.query("SELECT * FROM simulation_routing WHERE kind='state_authority'")
  ).rows[0]!;
  try {
    await w.owner.query(
      "UPDATE simulation_routing SET institution_id=$1 WHERE kind='state_authority'",
      [state.institutionId],
    );
    await code(
      w.command(state, beforeRoute, 'submit', { attested: true }),
      'STATE_REVIEW_ROUTE_UNAVAILABLE',
    );
    await unchanged(state, beforeRoute);
  } finally {
    await w.owner.query(
      "UPDATE simulation_routing SET institution_id=$1 WHERE kind='state_authority'",
      [route.institution_id],
    );
  }
  const availableReviewers = (
    await w.owner.query(
      "SELECT id,conflicts FROM actors WHERE realm='simulation' AND institution_id=$1 AND 'supervisor'=ANY(roles)",
      [route.institution_id],
    )
  ).rows;
  try {
    await w.owner.query(
      "UPDATE actors SET conflicts=array_append(conflicts,$1) WHERE realm='simulation' AND institution_id=$2 AND 'supervisor'=ANY(roles)",
      [beforeRoute.id, route.institution_id],
    );
    await code(
      w.command(state, beforeRoute, 'submit', { attested: true }),
      'STATE_REVIEW_ROUTE_UNAVAILABLE',
    );
    await unchanged(state, beforeRoute);
  } finally {
    for (const r of availableReviewers)
      await w.owner.query('UPDATE actors SET conflicts=$2 WHERE id=$1', [r.id, r.conflicts]);
  }

  const draft = await w.create(state, 'offer', 'Invented fresh scope checks', offerInput(verified));
  const stateCached = await w.actor(state.id);
  await w.owner.query("UPDATE actors SET roles=ARRAY['support'] WHERE id=$1", [state.id]);
  await code(
    w.program.command(stateCached, wire(draft, 'save_draft', offerInput(verified))),
    'STATE_PACKET_OWNER_REQUIRED',
  );
  await code(
    w.evidence.upload(stateCached, {
      recordId: draft.id,
      expectedVersion: draft.version,
      idempotencyKey: randomUUID(),
      filename: 'invented-revoked-state.txt',
      description: 'Invented forbidden upload',
      base64: Buffer.from('Invented rejected state evidence').toString('base64'),
      attestedSynthetic: true,
    }),
    'RECORD_PERMISSION',
  );
  await w.owner.query("UPDATE actors SET roles=ARRAY['state'],institution_id=$2 WHERE id=$1", [
    state.id,
    randomUUID(),
  ]);
  await code(
    w.program.command(stateCached, wire(draft, 'save_draft', offerInput(verified))),
    'STATE_PACKET_OWNER_REQUIRED',
  );
  await w.owner.query('UPDATE actors SET institution_id=$2 WHERE id=$1', [
    state.id,
    state.institutionId,
  ]);
  await unchanged(state, draft);
  await w.attach(state, draft);
  const wrongTerms = {
    ...offerInput(verified),
    financialTerms: {
      ...prepared.input.financialTerms,
      rate: { numerator: '1', denominator: '10' },
    },
    evidenceIds: (await w.get(state, draft.id))!.data['evidenceIds'],
  };
  await w.command(state, draft, 'save_draft', wrongTerms);
  const wrong = (await w.get(state, draft.id))!;
  await code(
    w.command(state, wrong, 'submit', { attested: true }),
    'STATE_FINANCIAL_TERMS_MISMATCH',
  );
  await unchanged(state, wrong);

  const otherState = await stateStaff(w, 'state');
  await w.owner.query('UPDATE actors SET institution_id=$2 WHERE id=$1', [
    otherState.id,
    randomUUID(),
  ]);
  const wrongState = await w.create(
    otherState,
    'offer',
    'Invented unrelated state authority',
    offerInput(verified),
  );
  await w.attach(otherState, wrongState);
  await code(
    w.command(otherState, wrongState, 'submit', { attested: true }),
    'STATE_AUTHORITY_UNAVAILABLE',
  );

  const offer = await submittedOffer(w, state, verified);
  await reviewGuards(offer.record, 'begin_review', {});
  await w.command(reviewer, offer.record, 'begin_review');
  const reviewing = (await w.get(state, offer.record.id))!;
  await w.owner.query('UPDATE case_records SET version=version+1 WHERE id=$1', [verified.id]);
  try {
    await code(
      w.command(reviewer, reviewing, 'publish', publicationInput(w.today)),
      'STATE_AUTHORITY_UNAVAILABLE',
    );
    await code(
      w.command(reviewer, reviewing, 'deny', {
        reasons: 'INTERNAL stale authority denial',
        evidenceIds: [offer.evidenceId],
      }),
      'STATE_AUTHORITY_UNAVAILABLE',
    );
  } finally {
    await w.owner.query('UPDATE case_records SET version=$2 WHERE id=$1', [
      verified.id,
      authorityVersion,
    ]);
  }
  await reviewGuards(reviewing, 'publish', publicationInput(w.today));
  await reviewGuards(reviewing, 'deny', {
    reasons: 'INTERNAL denial',
    evidenceIds: [offer.evidenceId],
  });
  await code(
    w.command(reviewer, reviewing, 'publish', {
      ...publicationInput(w.today),
      publishDate: addCalendarDays(w.today, -1),
    }),
    'STATE_PUBLICATION_DATE',
  );
  await unchanged(state, reviewing);
  const publicationWire = wire(reviewing, 'publish', publicationInput(w.today)),
    currentReviewer = await w.actor(reviewer.id);
  const [accepted, retry] = await Promise.all([
    w.program.command(currentReviewer, publicationWire),
    w.program.command(currentReviewer, publicationWire),
  ]);
  assert.deepEqual(retry, accepted);
  const published = accepted.record!,
    snapshot = PublishedStateOfferSchema.parse(published.data['publishedStateOffer']);
  const view = (await catalogue.catalogue(member, { offerId: published.id })).offers[0]!;
  assert.deepEqual(view.publication, snapshot);
  assert.equal(view.digest, digest(snapshot));
  assert.equal(view.publication.authority.version, authorityVersion);
  assert.equal(
    Date.parse(snapshot.earliestRankingsCloseAt) - Date.parse(snapshot.publishedAt),
    90 * 86400000,
  );
  const disclosed = JSON.stringify(view);
  for (const hidden of [
    'INTERNAL',
    state.id,
    reviewer.id,
    offer.evidenceId,
    prepared.evidenceId,
    'Invented test evidence only.',
  ])
    assert.ok(!disclosed.includes(hidden));
  assert.equal(await w.get(member, published.id), null);
  await code(w.evidence.list(member, published.id), 'NOT_FOUND');
  await assert.rejects(
    w.store.transaction(member, (tx) => tx.query('SELECT * FROM simulation_state_publications')),
    /permission denied/,
  );
  await code(
    catalogue.catalogue({ ...member, realm: 'program' }, { offerId: published.id }),
    'REALM_MISMATCH',
  );
  assert.equal(
    (
      await w.store.transaction({ ...member, realm: 'program' }, (tx) =>
        tx.query('SELECT simulation_state_offer_catalogue($1,NULL,20)', [published.id]),
      )
    ).rowCount,
    0,
  );
  await assert.rejects(
    w.owner.query('UPDATE simulation_state_publications SET digest=$2 WHERE offer_id=$1', [
      published.id,
      'f'.repeat(64),
    ]),
    /immutable/,
  );
  assert.equal(
    (
      await w.owner.query("SELECT count(*) FROM receipts WHERE record_id=$1 AND action='publish'", [
        published.id,
      ])
    ).rows[0]!.count,
    '1',
  );
  for (const invalidPublication of [
    { ...snapshot, policyVersion: undefined },
    { ...snapshot, policyVersion: 'invented-other-policy' },
    { ...snapshot, privateRecordData: { internal: 'INTERNAL must not enter catalogue' } },
  ]) {
    await code(
      catalogue.checked(() =>
        w.store.transaction(currentReviewer, (tx) =>
          tx.query('SELECT simulation_publish_state_offer($1,$2,$3::jsonb,$4)', [
            published.id,
            accepted.receipt.id,
            JSON.stringify(invalidPublication),
            digest(invalidPublication),
          ]),
        ),
      ),
      'STATE_PUBLICATION_BINDING',
    );
  }
  assert.deepEqual((await catalogue.catalogue(member, { offerId: published.id })).offers[0], view);

  // Each new review transition checks current authority, including exact expiry and withdrawal.
  const short = await verifiedAuthority(w, state, reviewer, {
    ...authorityInput(w.today),
    validThrough: w.today,
  });
  const unsubmitted = await w.create(
    state,
    'offer',
    'Invented expired authority submission',
    offerInput(short.record),
  );
  await w.attach(state, unsubmitted);
  w.day = addCalendarDays(w.today, 1);
  await code(
    w.command(state, unsubmitted, 'submit', { attested: true }),
    'STATE_AUTHORITY_UNAVAILABLE',
  );
  w.day = w.today;
  await w.command(state, unsubmitted, 'submit', { attested: true });
  const shortSubmitted = (await w.get(state, unsubmitted.id))!;
  w.day = addCalendarDays(w.today, 1);
  await code(w.command(reviewer, shortSubmitted, 'begin_review'), 'STATE_AUTHORITY_UNAVAILABLE');
  w.day = w.today;
  await w.command(reviewer, shortSubmitted, 'begin_review');
  const shortReview = (await w.get(state, shortSubmitted.id))!;
  for (const action of ['publish', 'deny']) {
    w.day = addCalendarDays(w.today, 1);
    await code(
      w.command(
        reviewer,
        shortReview,
        action,
        action === 'publish'
          ? publicationInput(w.day)
          : { reasons: 'INTERNAL denial', evidenceIds: shortReview.data['evidenceIds'] },
      ),
      'STATE_AUTHORITY_UNAVAILABLE',
    );
    await unchanged(state, shortReview);
  }
  w.day = w.today;
  const pendingWithdrawal = await submittedOffer(w, state, short.record);
  await w.command(state, short.record, 'withdraw', {
    reasons: 'INTERNAL future authority cessation',
  });
  await code(
    w.command(reviewer, pendingWithdrawal.record, 'begin_review'),
    'STATE_AUTHORITY_UNAVAILABLE',
  );
  for (const action of ['publish', 'deny'])
    await code(
      w.command(
        reviewer,
        shortReview,
        action,
        action === 'publish'
          ? publicationInput(w.today)
          : { reasons: 'INTERNAL denial', evidenceIds: shortReview.data['evidenceIds'] },
      ),
      'STATE_AUTHORITY_UNAVAILABLE',
    );
  const unavailableDraft = await w.create(
    state,
    'offer',
    'Invented withdrawn authority submission',
    offerInput(short.record),
  );
  await w.attach(state, unavailableDraft);
  await code(
    w.command(state, unavailableDraft, 'submit', { attested: true }),
    'STATE_AUTHORITY_UNAVAILABLE',
  );
  await w.command(state, shortReview, 'withdraw', {
    reasons: 'INTERNAL abandon unavailable preparation',
  });

  const racingAuthority = await verifiedAuthority(w, state, reviewer),
    racingOffer = await submittedOffer(w, state, racingAuthority.record);
  await w.command(reviewer, racingOffer.record, 'begin_review');
  const racingReview = (await w.get(state, racingOffer.record.id))!;
  const race = await Promise.allSettled([
    w.command(reviewer, racingReview, 'publish', publicationInput(w.today)),
    w.command(state, racingAuthority.record, 'withdraw', {
      reasons: 'INTERNAL prospective authority withdrawal',
    }),
  ]);
  assert.equal(race[1]!.status, 'fulfilled');
  const racePublication = race[0]!;
  if (racePublication.status === 'rejected') {
    assert.equal(racePublication.reason.code, 'STATE_AUTHORITY_UNAVAILABLE');
    await unchanged(state, racingReview);
  } else {
    assert.equal(
      (await catalogue.catalogue(member, { offerId: racingReview.id })).offers[0]!.status,
      'authority_unavailable',
    );
  }
  assert.equal(
    (
      await w.owner.query("SELECT count(*) FROM receipts WHERE record_id=$1 AND action='publish'", [
        racingReview.id,
      ])
    ).rows[0]!.count,
    racePublication.status === 'fulfilled' ? '1' : '0',
  );
  assert.equal(
    (
      await w.store.transaction(member, (tx) =>
        tx.query('SELECT simulation_state_offer_choice($1) AS choice', [racingReview.id]),
      )
    ).rows[0]!.choice,
    null,
  );

  // A real member approval can bind only the disclosed offer, without a private-offer grant.
  const first = await w.person(),
    second = await w.person(),
    labor = await w.persona('labor');
  const group = await w.association(
    first,
    second,
    labor,
    'Invented state offer compact group ' + randomUUID(),
  );
  const prereq = await compactPrerequisites(w, first, group.association, published);
  const compact = await w.create(
    first,
    'compact',
    'Invented compact with real synthetic publication',
    prereq.input,
  );
  const resolution = await w.create(first, 'resolution', 'Invented published-term approval', {
    associationId: group.association.id,
    decision: 'compact',
    compactId: compact.id,
    shareCompactTerms: true,
    proposal: 'Approve the exact immutable synthetic offer',
  });
  assert.equal(await w.get(first, published.id), null);
  const plan = (resolution.data['compactBinding'] as { plan: { offer: { publication: unknown } } })
    .plan;
  assert.deepEqual(plan.offer.publication, snapshot);
  // The simulated clock is captured at construction; PostgreSQL CURRENT_DATE
  // can advance across UTC midnight. Give this synthetic vote a future close.
  const voteClosesAt = addCalendarDays(w.today, 2);
  await w.command(first, resolution, 'open_vote', { closesAt: voteClosesAt });
  await w.command(first, resolution, 'record_vote', { unitId: group.firstUnit.id, choice: 'yes' });
  await w.command(second, resolution, 'record_vote', {
    unitId: group.secondUnit.id,
    choice: 'yes',
  });
  w.day = addCalendarDays(voteClosesAt, 1);
  const approval = (await w.command(labor, resolution, 'tally')).record!;
  w.day = w.today;
  await w.command(first, compact, 'submit', { attested: true, memberResolutionId: approval.id });
  await w.command(prereq.supervisor, compact, 'begin_review');
  const compactPublished = (
    await w.command(prereq.supervisor, compact, 'publish', {
      withinMenu: true,
      workerControl: true,
      publishedDate: w.today,
      reasons: findings,
    })
  ).record!;
  // Explicit downstream effective-compact fixture: no signature, actual match, permit or execution is asserted.
  await w.owner.query("UPDATE case_records SET state='effective' WHERE id=$1", [compact.id]);
  const fiscal = await financialStaff(w, 'fiscal');
  await w.owner.query(
    "INSERT INTO grants(id,realm,record_id,owner_id,subject_id,permissions,expires_at) VALUES($1,'simulation',$2,$3,$4,ARRAY['read'],now()+interval '1 hour')",
    [randomUUID(), compact.id, first.id, fiscal.id],
  );
  assert.equal(await w.get(fiscal, published.id), null, 'Finance receives no private offer access');
  const calculation = async () => {
    const schedule = await w.create(
      first,
      'financial_schedule',
      'Invented existing compact obligation ' + randomUUID(),
      { compactId: compact.id, fiscalYear: 2026, schedule: financialSchedule() },
    );
    await w.command(first, schedule, 'submit', { attested: true });
    return (
      await w.command(fiscal, schedule, 'calculate', {
        noticeDate: w.today,
        noticeReference: 'Invented financial notice',
      })
    ).record!;
  };
  const before = await calculation();

  // A choice holds a shared lock until acceptance; prospective withdrawal must wait for it.
  let release!: () => void, locked!: (pid: number) => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    lockReady = new Promise<number>((resolve) => {
      locked = resolve;
    });
  const held = w.store.transaction(member, async (tx) => {
    const choice = (
      await tx.query('SELECT simulation_state_offer_choice($1) AS choice', [published.id])
    ).rows[0]!.choice;
    assert.deepEqual(choice.publication, snapshot);
    locked((await tx.query('SELECT pg_backend_pid() AS pid')).rows[0]!.pid);
    await gate;
  });
  const holder = await lockReady;
  const withdraw = w.command(state, published, 'withdraw', {
    reasons: 'INTERNAL future participation ends; obligations remain',
  });
  try {
    const deadline = Date.now() + 5000;
    let blocked = false;
    while (!blocked && Date.now() < deadline) {
      blocked = (
        await w.owner.query(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS blocked',
          [holder],
        )
      ).rows[0]!.blocked;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, 'Withdrawal waits on the accepted published-choice revision');
  } finally {
    release();
    await held;
  }
  await withdraw;
  const withdrawnView = (await catalogue.catalogue(member, { offerId: published.id })).offers[0]!;
  assert.equal(withdrawnView.status, 'withdrawn');
  assert.deepEqual(withdrawnView.publication, snapshot);
  assert.equal(withdrawnView.digest, view.digest);
  assert.equal(
    (
      await w.store.transaction(member, (tx) =>
        tx.query('SELECT simulation_state_offer_choice($1) AS choice', [published.id]),
      )
    ).rows[0]!.choice,
    null,
  );
  const newCompact = await w.create(first, 'compact', 'Invented rejected new choice', prereq.input);
  await assert.rejects(
    w.create(first, 'resolution', 'No reuse of withdrawn terms', {
      associationId: group.association.id,
      decision: 'compact',
      compactId: newCompact.id,
      shareCompactTerms: true,
      proposal: 'Invented forbidden new choice',
    }),
    /published offer/,
  );
  assert.deepEqual(
    await w.program.command(await w.actor(reviewer.id), publicationWire),
    accepted,
    'Historical publication recovery keeps the original snapshot',
  );
  const after = await calculation();
  assert.deepEqual(after.data['calculation'], before.data['calculation']);
  assert.deepEqual(
    (after.data['financialBasis'] as { terms: unknown }).terms,
    snapshot.financialTerms,
  );
  assert.equal(
    (after.data['financialBasis'] as { offerVersion: number }).offerVersion,
    snapshot.version,
  );
  assert.equal((after.data['calculation'] as { statePayment: string }).statePayment, '45.00');
  assert.equal(
    (await w.get(first, compact.id))!.data['approvedCompactDigest'],
    compactPublished.data['approvedCompactDigest'],
  );
  const adjudicator = await financialStaff(w, 'adjudicator');
  await w.command(first, after, 'request_review', {
    disputedAmount: '5.00',
    reasons: 'Invented input correction after future offer withdrawal',
  });
  await w.command(adjudicator, after, 'begin_calculation_review', {
    hearingDate: w.today,
    noticeReference: 'Invented hearing notice',
  });
  const evidence = await attachFinancialEvidence(w, adjudicator, after.id);
  await w.command(adjudicator, after, 'record_calculation_hearing', {
    hearingRecord: 'Invented hearing under unchanged original compact',
    evidenceIds: [evidence],
  });
  const corrected = (
    await w.command(adjudicator, after, 'decide_calculation_review', {
      disposition: 'correct',
      schedule: financialSchedule('200.00'),
      reasons: 'Invented supported correction',
      judicialReviewRoute: 'Invented court route; no filing',
    })
  ).record!;
  assert.equal((corrected.data['calculation'] as { statePayment: string }).statePayment, '40.00');
  assert.deepEqual(
    (corrected.data['financialBasis'] as { terms: unknown }).terms,
    snapshot.financialTerms,
  );

  // A non-UTC session near UTC midnight and across DST agrees with the exact UTC publication clock.
  const dstYear = Number(w.today.slice(0, 4)) + 1;
  const dstAuthority = await verifiedAuthority(w, state, reviewer, {
    ...authorityInput(w.today),
    validThrough: `${dstYear + 1}-01-31`,
  });
  const zonedOffer = await submittedOffer(w, state, dstAuthority.record);
  await w.command(reviewer, zonedOffer.record, 'begin_review');
  const zonedRecord = (await w.get(state, zonedOffer.record.id))!,
    zonedUrl = new URL(process.env['DATABASE_URL']!);
  zonedUrl.searchParams.set(
    'options',
    (zonedUrl.searchParams.get('options') ?? '') + ' -c TimeZone=America/New_York',
  );
  const zonedStore = new Store(zonedUrl.toString(), fixtureKey()),
    zonedNow = `${dstYear}-10-31T00:05:00.000Z`;
  try {
    const zonedProgram = new ProgramService(
      zonedStore,
      'simulation',
      'simulation',
      () => new Date(zonedNow),
    );
    const result = await zonedProgram.command(
      await w.actor(reviewer.id),
      wire(zonedRecord, 'publish', publicationInput(zonedNow.slice(0, 10))),
    );
    const p = PublishedStateOfferSchema.parse(result.record!.data['publishedStateOffer']);
    assert.equal(p.earliestRankingsCloseAt, `${dstYear + 1}-01-29T00:05:00.000Z`);
    assert.equal(
      (await zonedStore.pool.query('SHOW TimeZone')).rows[0]!.TimeZone,
      'America/New_York',
    );
  } finally {
    await zonedStore.close();
  }
  console.log(
    'PASS synthetic state offers: exact independent authority/rate/method, concurrent Rate Act conflicts, current roles and conflicts at each transition, immutable allowlisted participant terms, UTC 90-day close boundary, exact replay, locked prospective withdrawal, new-choice denial, and preserved existing compact calculation/review. No actual authority, Exchange, legal publication, signature or payment is activated.',
  );
} finally {
  await w.close();
}
