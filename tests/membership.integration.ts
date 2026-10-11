import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { ActorSchema, type Actor, type Kind } from '@cornerstone/contracts';
import { digest } from '@cornerstone/security';
import { addCalendarDays } from '@cornerstone/domain';
import { fixtureKey } from './fixture-key.js';
import { ProgramService } from '../apps/api/src/service.js';
import { EvidenceService } from '../apps/api/src/evidence.js';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import { MembershipService } from '../apps/api/src/membership.js';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL'] ||
  !process.env['WORKER_DATABASE_URL']
)
  throw Error('Isolated synthetic connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const worker = new ActivityWorker(process.env['WORKER_DATABASE_URL']);
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
const today = new Date().toISOString().slice(0, 10);
let day = today;
const program = new ProgramService(
  store,
  'simulation',
  'simulation',
  () => new Date(day + 'T12:00:00Z'),
);
const members = new MembershipService(store, 'simulation', 'simulation');
const evidence = new EvidenceService(store, 'simulation', 'simulation', 'synthetic-postgres');
const tokens = new Map<string, string>();
async function actor(persona: string): Promise<Actor> {
  let token = tokens.get(persona);
  if (!token) {
    const row = (await store.pool.query('SELECT simulation_persona($1) AS id', [persona])).rows[0];
    assert.ok(row?.id);
    token = digest(randomUUID());
    await store.pool.query('SELECT auth_session($1,$2,$3)', [row.id, token, digest(randomUUID())]);
    tokens.set(persona, token);
  }
  return ActorSchema.parse(
    (await store.pool.query('SELECT * FROM auth_lookup($1)', [token])).rows[0]?.actor,
  );
}
async function get(persona: string, id: string) {
  return store.transaction(await actor(persona), (tx) => store.get(tx, id));
}
async function command(
  persona: string,
  id: string,
  action: string,
  input: Record<string, unknown> = {},
) {
  const a = await actor(persona),
    r = await store.transaction(a, (tx) => store.get(tx, id));
  assert.ok(r);
  return program.command(a, {
    recordId: id,
    expectedVersion: r.version,
    idempotencyKey: randomUUID(),
    action,
    input,
  });
}
async function create(persona: string, kind: Kind, title: string, input: Record<string, unknown>) {
  return (
    await program.create(await actor(persona), { kind, title, input, idempotencyKey: randomUUID() })
  ).record!;
}
async function attach(persona: string, id: string) {
  const a = await actor(persona),
    r = (await get(persona, id))!;
  const upload = await evidence.upload(a, {
    recordId: id,
    expectedVersion: r.version,
    idempotencyKey: randomUUID(),
    filename: 'invented.txt',
    description: 'Invented supporting account for the synthetic journey',
    base64: Buffer.from('Invented evidence only. No real person, event or finding.').toString(
      'base64',
    ),
    attestedSynthetic: true,
  });
  const item = (await evidence.list(a, id)).evidence[0]!;
  await evidence.validate(a, {
    recordId: id,
    evidenceId: item.id,
    expectedVersion: upload.record!.version,
    idempotencyKey: randomUUID(),
  });
  return item.id;
}
const reasons =
  'Synthetic written findings, contrary evidence and review route; no legal determination.';
const rights =
  'One vote, equal base ownership and distributions, inspection and first opportunities; no forced relocation, work, training, capital or personal debt.';
const closeInput = { pendingClaims: 0, equalRights: true, voluntary: true, reasons };
async function certifiedEvent(title: string) {
  const r = await create('participant', 'event_petition', title, {
    actionDate: '2000-01-01',
    actionText: 'Invented deliberate implemented contraction',
    industry: 'Invented lawful trade',
    objectiveEvidence: 'Invented objective expressly stated',
    contraryEvidence: 'Invented competing causes considered',
  });
  const e = await attach('participant', r.id);
  await command('participant', r.id, 'submit', { attested: true });
  await command('labor', r.id, 'open_record', {
    noticeDate: addCalendarDays(today, -61),
    publicDocket: 'synthetic-docket',
  });
  await command('labor', r.id, 'close_record');
  await command('labor', r.id, 'certify', {
    implemented: true,
    lawfulIndustry: true,
    deliberateObjective: true,
    materialDirectGroup: true,
    firstLossDate: '2000-02-01',
    reasons,
    evidenceIds: [e],
  });
  return r.id;
}
async function eligible(persona: string, eventId: string) {
  const r = await create(persona, 'claim', 'Invented direct livelihood injury', {
    eventId,
    workerType: 'employee',
    earnedIncomeShare: 0.75,
    injuryDescription: 'Invented primary-job loss with retained part-time work',
    lossDate: '2000-02-01',
  });
  const e = await attach(persona, r.id);
  await command(persona, r.id, 'submit', { attested: true });
  await command('labor', r.id, 'begin_review');
  await command('labor', r.id, 'find_eligible', {
    directInjuryProven: true,
    reasons,
    evidenceIds: [e],
  });
  return r.id;
}
async function delivered(receiptId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await worker.once(100);
    const row = await owner.query('SELECT state FROM outbox WHERE receipt_id=$1', [receiptId]);
    if (row.rows[0]?.state === 'delivered') return;
  }
  throw Error('Expected in-app delivery did not finish.');
}
async function hasNotice(persona: string, receiptId: string) {
  return store.transaction(
    await actor(persona),
    async (tx) =>
      (await tx.query('SELECT 1 FROM activity_notifications WHERE receipt_id=$1', [receiptId]))
        .rowCount === 1,
  );
}
async function respond(persona: string, id: string, response: 'accepted' | 'declined', ack = true) {
  const a = await actor(persona),
    invitation = (await members.list(a)).invitations.find((i) => i.associationId === id)!;
  return members.respond(a, {
    recordId: id,
    invitationId: invitation.id,
    expectedVersion: (await get(persona, id))!.version,
    idempotencyKey: randomUUID(),
    response,
    rightsAcknowledged: ack,
  });
}
try {
  await store.verifyRole();
  await worker.verifyRole();
  const p = await actor('participant'),
    m = await actor('member');
  const event = await certifiedEvent('Invented membership journey event');
  const first = await eligible('participant', event),
    second = await eligible('member', event);
  const units = [
    { claimId: first, personId: p.id },
    { claimId: second, personId: m.id },
  ];
  const association = await create('participant', 'association', 'Invented closed association', {
    eventId: event,
    units,
    rollOpened: today,
    constitution: rights,
  });
  // Invitation validation rolls the entire command back, including its receipt and outbox.
  const wrong = await create('participant', 'association', 'Invented invalid claimant roll', {
    eventId: event,
    units: [
      { claimId: first, personId: m.id },
      { claimId: second, personId: p.id },
    ],
    rollOpened: today,
    constitution: rights,
  });
  await assert.rejects(command('participant', wrong.id, 'submit', { attested: true }), {
    code: 'FOUNDING_ROLL_INVALID',
  });
  assert.equal((await get('participant', wrong.id))!.version, 1);
  const backdated = await create('participant', 'association', 'Invented backdated opening', {
    eventId: event,
    units,
    rollOpened: addCalendarDays(today, -179),
    constitution: rights,
  });
  await assert.rejects(command('participant', backdated.id, 'submit', { attested: true }), {
    code: 'FOUNDING_OPENING_DATE',
  });
  const submitted = await command('participant', association.id, 'submit', { attested: true });
  await delivered(submitted.receipt.id);
  assert.equal(
    await hasNotice('member', submitted.receipt.id),
    true,
    'invited founder receives a submission update',
  );
  assert.equal(
    await hasNotice('labor', submitted.receipt.id),
    true,
    'assigned reviewer receives a submission update',
  );
  assert.equal(
    await hasNotice('fiscal', submitted.receipt.id),
    false,
    'unassigned staff receive nothing',
  );
  assert.ok(await get('member', association.id));
  assert.equal(await get('member', first), null);
  await assert.rejects(evidence.list(m, first), /Record not found/);
  const invite = (await members.list(m)).invitations.find(
    (i) => i.associationId === association.id,
  )!;
  const response = {
    recordId: association.id,
    invitationId: invite.id,
    expectedVersion: (await get('participant', association.id))!.version,
    idempotencyKey: randomUUID(),
    response: 'accepted',
    rightsAcknowledged: true,
  };
  await assert.rejects(members.respond(p, response), { code: 'INVITATION_REQUIRED' });
  await assert.rejects(respond('member', association.id, 'accepted', false));
  await respond('member', association.id, 'declined', false);
  assert.equal((await members.rollView(m, association.id)).fullRoll, false);
  assert.equal((await members.rollView(m, association.id)).invitations.length, 1);
  const personalResponse = await respond('participant', association.id, 'accepted');
  await delivered(personalResponse.receipt.id);
  assert.equal(
    await hasNotice('member', personalResponse.receipt.id),
    false,
    'individual responses are not broadcast to every founder',
  );
  await command('labor', association.id, 'begin_review');
  await assert.rejects(command('labor', association.id, 'close_roll', closeInput), {
    code: 'FOUNDING_PERIOD_OPEN',
  });
  day = addCalendarDays(today, 181);
  await assert.rejects(command('labor', association.id, 'close_roll', closeInput), {
    code: 'PERSONAL_FOUNDING_CONSENT',
  });
  day = today;
  const accepted = {
    ...response,
    expectedVersion: (await get('member', association.id))!.version,
    idempotencyKey: randomUUID(),
  };
  const [one, two] = await Promise.all([
    members.respond(m, accepted),
    members.respond(m, accepted),
  ]);
  assert.equal(one.receipt.id, two.receipt.id);
  await respond('member', association.id, 'declined', false);
  await respond('member', association.id, 'accepted');
  day = addCalendarDays(today, 180);
  await assert.rejects(command('labor', association.id, 'close_roll', closeInput), {
    code: 'FOUNDING_PERIOD_OPEN',
  });
  day = addCalendarDays(today, 181);
  const closed = await command('labor', association.id, 'close_roll', closeInput);
  await delivered(closed.receipt.id);
  assert.equal(
    await hasNotice('member', closed.receipt.id),
    true,
    'active members receive closure updates',
  );
  day = today; // The injected clock is a test harness, never an API option.
  assert.equal((await get('participant', association.id))!.state, 'ready');
  assert.equal((await actor('participant')).assurance, 'draft');
  assert.ok((await actor('participant')).roles.includes('member'));
  const pu = (await members.list(await actor('participant'))).units.find(
    (u) => u.associationId === association.id,
  )!;
  const mu = (await members.list(m)).units.find((u) => u.associationId === association.id)!;
  assert.ok(pu && mu);
  await assert.rejects(respond('member', association.id, 'declined', false), {
    code: 'ROLL_CLOSED',
  });
  await assert.rejects(new MembershipService(store, 'proposal', 'proposal').list(p), {
    code: 'MEMBERSHIP_DISABLED',
  });
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    m.id,
    association.id,
  ]);
  assert.equal((await members.list(await actor('member'))).units.length, 0);
  assert.equal(await get('member', association.id), null);
  assert.equal(
    await hasNotice('member', closed.receipt.id),
    false,
    'a conflict hides previous activity',
  );
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [m.id]);
  const duplicate = await create('participant', 'association', 'Invented duplicate active roll', {
    eventId: event,
    units,
    rollOpened: today,
    constitution: rights,
  });
  await assert.rejects(command('participant', duplicate.id, 'submit', { attested: true }), {
    code: 'FOUNDING_ROLL_INVALID',
  });
  const resolution = await create('participant', 'resolution', 'Invented denominator decision', {
    associationId: association.id,
    decision: 'compact',
    proposal: 'Invented exact compact decision',
  });
  assert.equal(resolution.data['unitCount'], 2);
  assert.equal(await get('member', resolution.id), null);
  const opened = await command('participant', resolution.id, 'open_vote', {
    closesAt: addCalendarDays(today, 1),
  });
  await delivered(opened.receipt.id);
  assert.equal(
    await hasNotice('member', opened.receipt.id),
    true,
    'frozen-roll members receive a voting update',
  );
  assert.ok(await get('member', resolution.id));
  await assert.rejects(
    command('member', resolution.id, 'record_vote', { unitId: pu.unitId, choice: 'yes' }),
    { code: 'UNIT_AUTHORITY' },
  );
  const ballot = {
    recordId: resolution.id,
    expectedVersion: (await get('participant', resolution.id))!.version,
    idempotencyKey: randomUUID(),
    action: 'record_vote',
    input: { unitId: pu.unitId, choice: 'yes' },
  };
  const [b1, b2] = await Promise.all([
    program.command(await actor('participant'), ballot),
    program.command(await actor('participant'), ballot),
  ]);
  assert.equal(b1.receipt.id, b2.receipt.id);
  await delivered(b1.receipt.id);
  assert.equal(
    await hasNotice('member', b1.receipt.id),
    false,
    'a personal ballot is not broadcast',
  );
  await assert.rejects(
    command('participant', resolution.id, 'record_vote', { unitId: pu.unitId, choice: 'no' }),
    { code: 'DUPLICATE_BALLOT' },
  );
  for (const key of ['choice', 'unitId', 'ballots']) assert.equal(key in b1.record!.data, false);
  assert.equal((await members.ballotView(m, resolution.id)).ownBallots.length, 0);
  const peerRows = await store.transaction(m, (tx) =>
    tx.query('SELECT * FROM ballots WHERE resolution_id=$1', [resolution.id]),
  );
  assert.equal(peerRows.rowCount, 0);
  const stored = (
    await owner.query('SELECT * FROM ballots WHERE resolution_id=$1', [resolution.id])
  ).rows[0];
  assert.ok(!JSON.stringify(stored.choice_cipher).includes('yes'));
  await assert.rejects(
    owner.query('UPDATE ballots SET choice_commitment=choice_commitment WHERE id=$1', [stored.id]),
    /Append-only/,
  );
  const privateVersions = await store.transaction(m, (tx) =>
    tx.query('SELECT version FROM case_versions WHERE record_id=$1', [resolution.id]),
  );
  for (const v of privateVersions.rows) {
    const saved = await store.transaction(m, (tx) =>
      store.getVersion(tx, resolution.id, v.version),
    );
    for (const key of ['choice', 'unitId', 'ballots']) assert.equal(key in saved!.data, false);
  }
  await assert.rejects(command('labor', resolution.id, 'tally'), { code: 'VOTE_OPEN' });
  await command('member', resolution.id, 'record_vote', { unitId: mu.unitId, choice: 'abstain' });
  assert.equal(
    (await members.ballotView(await actor('participant'), resolution.id)).ownBallots[0]!.choice,
    'yes',
  );
  assert.equal((await members.ballotView(m, resolution.id)).ownBallots[0]!.choice, 'abstain');
  assert.equal(
    (await members.ballotView(await actor('labor'), resolution.id)).ownBallots.length,
    0,
  );
  day = addCalendarDays(today, 2);
  const tally = (await command('labor', resolution.id, 'tally')).record!;
  assert.deepEqual(
    [tally.data['yes'], tally.data['abstain'], tally.data['notCast'], tally.data['approved']],
    [1, 1, 0, false],
  );
  // A second independent event yields unclosed invitations for browser consent checks.
  day = today;
  const another = await certifiedEvent('Invented later membership event');
  const ac = await eligible('participant', another),
    bc = await eligible('member', another);
  const pending = await create('participant', 'association', 'Invented voluntary invitation', {
    eventId: another,
    units: [
      { claimId: ac, personId: p.id },
      { claimId: bc, personId: m.id },
    ],
    rollOpened: today,
    constitution: rights,
  });
  await command('participant', pending.id, 'submit', { attested: true });
  console.log(
    'PASS: actual synthetic event/claim findings, personal consent, 180-day roll, role/realm/conflict isolation, one active unit per claim, frozen voting, encrypted private choices, idempotent receipts and all-unit majority.',
  );
} finally {
  await worker.close();
  await store.close();
  await owner.end();
}
