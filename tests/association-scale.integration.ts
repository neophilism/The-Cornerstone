import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { ActorSchema, type Actor } from '@cornerstone/contracts';
import { addCalendarDays } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { draftPolicy } from '@cornerstone/policy';
import { ProgramService } from '../apps/api/src/service.js';
import { MembershipService } from '../apps/api/src/membership.js';
import { fixtureKey } from './fixture-key.js';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL']
)
  throw Error('Isolated synthetic connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
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
async function actor(persona: string): Promise<Actor> {
  const row = (await store.pool.query('SELECT simulation_persona($1) AS id', [persona])).rows[0];
  const token = digest(randomUUID());
  await store.pool.query('SELECT auth_session($1,$2,$3)', [row.id, token, digest(randomUUID())]);
  return ActorSchema.parse(
    (await store.pool.query('SELECT * FROM auth_lookup($1)', [token])).rows[0]?.actor,
  );
}
async function get(a: Actor, id: string) {
  return store.transaction(a, (tx) => store.get(tx, id));
}
async function command(a: Actor, id: string, action: string, input: object = {}) {
  return program.command(a, {
    recordId: id,
    expectedVersion: (await get(a, id))!.version,
    idempotencyKey: randomUUID(),
    action,
    input,
  });
}
const rights =
  'Voluntary founding rights, one vote, equal base ownership and distributions, inspection and first opportunities; no required work, move, training, capital or personal debt.';
const close = {
  pendingClaims: 0,
  equalRights: true,
  voluntary: true,
  reasons: 'Invented findings and review route; no legal determination.',
};
const scaleFindings = {
  accessibleMeetings: true,
  accessibleVoting: true,
  accessibleRecords: true,
  practicalDeliberation: true,
};
try {
  await store.verifyRole();
  const p = await actor('participant'),
    m = await actor('member');
  let labor = await actor('labor');
  const events = (await store.list(p)).filter(
    (r) => r.kind === 'event_petition' && r.state === 'certified',
  );
  assert.ok(events.length >= 2, 'Run the membership integration first.');
  // Bulk owner fixtures isolate association behavior at the true 2,501-unit boundary.
  // Earlier integration tests separately obtain eligibility through the actual evidence/review API.
  async function claims(people: string[], eventIds: string[]) {
    const rows = people.map((personId, i) => {
      const id = randomUUID();
      return {
        id,
        personId,
        payload: store.seal(
          {
            title: 'Invented scale-test eligible claim',
            data: {
              eventId: eventIds[i % eventIds.length],
              workerType: 'employee',
              earnedIncomeShare: 0.75,
              injuryDescription: 'Invented direct primary livelihood injury',
              lossDate: '2000-02-01',
            },
          },
          `cornerstone:record:${id}:1`,
        ),
      };
    });
    await owner.query(
      `INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,jurisdiction,policy_version,payload_cipher)
      SELECT x.id,'simulation','claim','eligible',1,x."personId",$2,'EX',$3,x.payload
      FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,"personId" uuid,payload jsonb)`,
      [JSON.stringify(rows), labor.institutionId, draftPolicy.version],
    );
    await owner.query('UPDATE actors SET assignments=assignments||$2::uuid[] WHERE id=$1', [
      labor.id,
      rows.map((r) => r.id),
    ]);
    labor = await actor('labor');
    return rows.map((r) => ({ claimId: r.id, personId: r.personId }));
  }
  async function association(
    title: string,
    units: { claimId: string; personId: string }[],
    eventId = events[0]!.id,
  ) {
    const r = (
      await program.create(p, {
        kind: 'association',
        title,
        input: { units, eventId, rollOpened: today, constitution: rights },
        idempotencyKey: randomUUID(),
      })
    ).record!;
    await command(p, r.id, 'submit', { attested: true });
    labor = await actor('labor');
    return r.id;
  }
  async function respond(a: Actor, id: string, choice: 'yes' | 'no' | 'abstain' = 'abstain') {
    const invitation = (await members.list(a)).invitations.find((i) => i.associationId === id)!;
    return members.respond(a, {
      recordId: id,
      invitationId: invitation.id,
      expectedVersion: (await get(a, id))!.version,
      response: 'accepted',
      rightsAcknowledged: true,
      scaleChoice: choice,
      idempotencyKey: randomUUID(),
    });
  }
  const mixedUnits = await claims(
    [p.id, m.id],
    events.slice(0, 2).map((e) => e.id),
  );
  const mixed = await association('Invented combined cohort', mixedUnits);
  await respond(p, mixed);
  await respond(m, mixed);
  await command(labor, mixed, 'begin_review');
  day = addCalendarDays(today, 181);
  const result = (await command(labor, mixed, 'close_roll', close)).record!;
  const represented = result.data['representedEvents'] as { eventId: string; claimIds: string[] }[];
  assert.equal(represented.length, 2);
  for (let i = 0; i < 2; i++)
    assert.deepEqual(represented.find((r) => r.eventId === events[i]!.id)!.claimIds, [
      mixedUnits[i]!.claimId,
    ]);
  day = today;
  const unrelated = await association(
    'Invented unrelated organizing event',
    await claims([p.id, m.id], [events[1]!.id]),
  );
  await respond(p, unrelated);
  await respond(m, unrelated);
  await command(labor, unrelated, 'begin_review');
  day = addCalendarDays(today, 181);
  await assert.rejects(command(labor, unrelated, 'close_roll', close), {
    code: 'EVENT_NOT_REPRESENTED',
  });
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1', [
        unrelated,
      ])
    ).rows[0].n,
    0,
  );
  day = today;
  const extras = Array.from({ length: 2499 }, () => randomUUID());
  await owner.query(
    `INSERT INTO actors(id,realm,issuer,subject) SELECT x,'simulation','synthetic:scale-fixture',x::text FROM unnest($1::uuid[]) x`,
    [extras],
  );
  const people = [p.id, m.id, ...extras];
  const large = await association(
    'Invented approved larger association',
    await claims(
      people,
      events.slice(0, 2).map((e) => e.id),
    ),
  );
  const pInvite = (await members.list(p)).invitations.find((i) => i.associationId === large)!;
  const response = {
    recordId: large,
    invitationId: pInvite.id,
    expectedVersion: (await get(p, large))!.version,
    response: 'accepted',
    rightsAcknowledged: true,
    scaleChoice: 'yes',
    idempotencyKey: randomUUID(),
  };
  await assert.rejects(members.respond(m, response), { code: 'INVITATION_REQUIRED' });
  const [one, two] = await Promise.all([
    members.respond(p, response),
    members.respond(p, response),
  ]);
  assert.equal(one.receipt.id, two.receipt.id);
  await respond(m, large, 'no');
  const visible = await members.rollView(p, large);
  assert.equal(visible.invitations.find((i) => i.personId === p.id)!.ownScaleChoice, 'yes');
  assert.equal(visible.invitations.find((i) => i.personId === m.id)!.ownScaleChoice, null);
  const peerRows = await store.transaction(p, (tx) =>
    tx.query('SELECT person_id FROM founding_scale_votes WHERE association_id=$1', [large]),
  );
  assert.deepEqual(
    peerRows.rows.map((r) => r.person_id),
    [p.id],
  );
  await assert.rejects(
    store.transaction(p, (tx) =>
      tx.query('UPDATE founding_scale_votes SET commitment=commitment WHERE association_id=$1', [
        large,
      ]),
    ),
    /permission denied/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [p.id, large]);
  await assert.rejects(members.rollView(p, large), { code: 'NOT_FOUND' });
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [p.id]);
  const invitationRows = (
    await owner.query('SELECT * FROM founding_invitations WHERE association_id=$1', [large])
  ).rows;
  const byPerson = new Map(invitationRows.map((r) => [r.person_id, r]));
  const fixtureVotes = extras.map((personId, index) => {
    const i = byPerson.get(personId)!;
    const body = {
      choice: index < 1249 ? 'yes' : 'abstain',
      nonce: randomBytes(32).toString('hex'),
    };
    return {
      invitation: i.id,
      person: personId,
      receipt: randomUUID(),
      cipher: store.seal(body, `cornerstone:scale:${large}:${i.id}:${i.terms_digest}`),
      commitment: digest({ invitationId: i.id, termsDigest: i.terms_digest, ...body }),
    };
  });
  await owner.query(
    `INSERT INTO receipts(id,realm,actor_id,record_id,version,action,digest,idempotency_key,request_digest)
    SELECT x.receipt,'simulation',x.person,$2,1,'founding_response',x.commitment,gen_random_uuid(),x.commitment
    FROM jsonb_to_recordset($1::jsonb) AS x(receipt uuid,person uuid,commitment text)`,
    [JSON.stringify(fixtureVotes), large],
  );
  await owner.query(
    `INSERT INTO founding_scale_votes(invitation_id,realm,association_id,person_id,choice_cipher,commitment,receipt_id)
    SELECT x.invitation,'simulation',$2,x.person,x.cipher,x.commitment,x.receipt
    FROM jsonb_to_recordset($1::jsonb) AS x(invitation uuid,person uuid,cipher jsonb,commitment text,receipt uuid)`,
    [JSON.stringify(fixtureVotes), large],
  );
  await owner.query(
    "UPDATE founding_invitations SET response='accepted',responded_at=now() WHERE association_id=$1 AND person_id=ANY($2::uuid[])",
    [large, extras],
  );
  await command(labor, large, 'begin_review');
  day = addCalendarDays(today, 181);
  await assert.rejects(command(labor, large, 'close_roll', { ...close, ...scaleFindings }), {
    code: 'LARGER_ASSOCIATION_FINDINGS',
  });
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1', [
        large,
      ])
    ).rows[0].n,
    0,
  );
  day = today;
  await respond(m, large, 'yes');
  const history = await owner.query(
    'SELECT receipt_id FROM founding_scale_history WHERE association_id=$1 AND person_id=$2',
    [large, m.id],
  );
  assert.equal(history.rowCount, 2);
  await assert.rejects(
    owner.query('UPDATE founding_scale_history SET commitment=commitment WHERE receipt_id=$1', [
      history.rows[0].receipt_id,
    ]),
    /Append-only/,
  );
  day = addCalendarDays(today, 181);
  const original = fixtureVotes[0]!;
  await owner.query(
    "UPDATE founding_scale_votes SET commitment=repeat('0',64) WHERE invitation_id=$1",
    [original.invitation],
  );
  await assert.rejects(command(labor, large, 'close_roll', { ...close, ...scaleFindings }), {
    code: 'SCALE_VOTE_INTEGRITY',
  });
  await owner.query('UPDATE founding_scale_votes SET commitment=$2 WHERE invitation_id=$1', [
    original.invitation,
    original.commitment,
  ]);
  await assert.rejects(
    command(labor, large, 'close_roll', {
      ...close,
      ...scaleFindings,
      practicalDeliberation: false,
    }),
    { code: 'LARGER_ASSOCIATION_FINDINGS' },
  );
  await assert.rejects(
    command(labor, large, 'close_roll', { ...close, ...scaleFindings, largerYes: 2501 }),
    { code: 'UNKNOWN_FIELD' },
  );
  const closed = (await command(labor, large, 'close_roll', { ...close, ...scaleFindings }))
    .record!;
  assert.equal(closed.data['largerYes'], 1251);
  assert.equal(closed.data['unitCount'], 2501);
  assert.equal(
    (
      await owner.query('SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1', [
        large,
      ])
    ).rows[0].n,
    2501,
  );
  assert.equal('scaleChoice' in closed.data, false);
  assert.equal('scaleVotes' in closed.data, false);
  await assert.rejects(respond(m, large, 'no'), { code: 'ROLL_CLOSED' });
  day = today;
  await association('Invented larger invitation', await claims(people, [events[0]!.id]));
  console.log(
    'PASS: separate cross-event claim identities, unrelated-event rollback, private own scale choices, actual 1,251-of-2,501 approval, four required practical-participation findings, no official-entered vote count, bulk atomic units and closed-period refusal.',
  );
} finally {
  await store.close();
  await owner.end();
}
