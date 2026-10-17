import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { draftPolicy } from '@cornerstone/policy';
import { verifySchema } from '@cornerstone/store';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import { Simulation } from './helpers/simulation.js';
import { eventFixture } from './helpers/claim-fixtures.js';
import { requirePrivateBrowserEnvironment } from './helpers/private-browser-environment.js';

// Browser prerequisites only. The complete adversarial database suites still run once
// in the separate database job; this setup never imports or bypasses their assertions.
requirePrivateBrowserEnvironment(process.env);
const w = await new Simulation().connect();
const worker = new ActivityWorker(process.env['WORKER_DATABASE_URL']!);

async function largerInvitation(participant: Actor, member: Actor, labor: Actor) {
  const event = await eventFixture(w, participant, labor);
  const extraPeople = Array.from({ length: 2499 }, () => randomUUID());
  await w.owner.query(
    "INSERT INTO actors(id,realm,issuer,subject) SELECT id,'simulation','cornerstone:private-browser-fixture',id::text FROM unnest($1::uuid[]) id",
    [extraPeople],
  );
  // The existing scale browser checks the actual >2,500 boundary. As in its original
  // integration producer, only the prior eligible claims are bulk owner fixtures.
  const claims = [participant.id, member.id, ...extraPeople].map((personId) => {
    const id = randomUUID();
    return {
      id,
      personId,
      payload: w.store.seal(
        {
          title: 'Invented scale-test eligible claim',
          data: {
            eventId: event.id,
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
  await w.owner.query(
    `INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,jurisdiction,policy_version,payload_cipher)
     SELECT x.id,'simulation','claim','eligible',1,x."personId",$2,'EX',$3,x.payload
     FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,"personId" uuid,payload jsonb)`,
    [JSON.stringify(claims), labor.institutionId, draftPolicy.version],
  );
  await w.owner.query('UPDATE actors SET assignments=assignments||$2::uuid[] WHERE id=$1', [
    labor.id,
    claims.map((c) => c.id),
  ]);
  const association = await w.create(participant, 'association', 'Invented larger invitation', {
    eventId: event.id,
    units: claims.map((c) => ({ claimId: c.id, personId: c.personId })),
    rollOpened: w.today,
    constitution:
      'Voluntary founding rights, one vote, equal base ownership and distributions, inspection and first opportunities; no required work, move, training, capital or personal debt.',
  });
  await w.command(participant, association, 'submit', { attested: true });
  return association.id;
}

async function financePrerequisites(member: Actor, fiscal: Actor, association: CaseRecord) {
  const offerId = randomUUID(),
    compactId = randomUUID();
  const terms = {
    version: 'synthetic-finance-v1',
    rateActId: 'SYNTHETIC-NOT-AN-ENACTED-RATE',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  };
  // Exact legacy downstream prerequisites used by finance.spec.ts. This does not
  // enact authority, accept an Exchange result or execute a real compact.
  for (const [id, kind, state, title, data] of [
    [offerId, 'offer', 'published', 'Invented finance offer', { financialTerms: terms }],
    [
      compactId,
      'compact',
      'effective',
      'Invented finance compact',
      { offerId, associationId: association.id },
    ],
  ] as const) {
    await w.owner.query(
      `INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,policy_version,payload_cipher)
       VALUES($1,'simulation',$2,$3,1,$4,$5,'proposal-v1',$6)`,
      [
        id,
        kind,
        state,
        member.id,
        fiscal.institutionId,
        w.store.seal({ title, data }, `cornerstone:record:${id}:1`),
      ],
    );
  }
  await w.owner.query('UPDATE actors SET assignments=assignments||$2::uuid[] WHERE id=$1', [
    fiscal.id,
    [offerId, compactId],
  ]);
  return compactId;
}

async function olderActivity(participant: Actor) {
  const record = await w.create(participant, 'dossier', 'Invented older inbox record', {
    actionDescription: 'Invented action',
    livelihood: 'Invented work',
    lossDescription: 'Invented loss',
  });
  const rows = Array.from({ length: 125 }, (_, i) => ({
    id: randomUUID(),
    receipt: randomUUID(),
    key: randomUUID(),
    stamp: i < 3 ? '2000-01-01T00:00:00.000002Z' : '2000-01-01T00:00:00.000001Z',
  }));
  await w.owner.query(
    `INSERT INTO receipts(id,realm,actor_id,record_id,version,action,idempotency_key,request_digest,digest,accepted_at)
     SELECT x.receipt,'simulation',$1,$2,1,'create',x.key,repeat('0',64),repeat('0',64),x.stamp
     FROM jsonb_to_recordset($3::jsonb) AS x(receipt uuid,key uuid,stamp timestamptz)`,
    [participant.id, record.id, JSON.stringify(rows)],
  );
  await w.owner.query(
    `INSERT INTO activity_notifications(id,realm,recipient_id,record_id,receipt_id,record_version,action,created_at)
     SELECT x.id,'simulation',$1,$2,x.receipt,1,'create',x.stamp
     FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,receipt uuid,stamp timestamptz)`,
    [participant.id, record.id, JSON.stringify(rows)],
  );
}

async function olderRecords(participant: Actor) {
  const rows = Array.from({ length: 205 }, (_, i) => {
    const id = randomUUID(),
      title = 'Invented older preparation ' + String(i + 1).padStart(3, '0');
    return {
      id,
      stamp: i === 0 ? '2000-01-01T00:00:00.000002Z' : '2000-01-01T00:00:00.000001Z',
      payload: w.store.seal(
        {
          title,
          data: {
            actionDescription: 'Invented action',
            livelihood: 'Invented work',
            lossDescription: 'Invented loss',
          },
        },
        `cornerstone:record:${id}:1`,
      ),
    };
  });
  await w.owner.query(
    `INSERT INTO case_records(id,realm,kind,state,version,owner_id,policy_version,payload_cipher,created_at,updated_at)
     SELECT x.id,'simulation','dossier','draft',1,$1,'proposal-v1',x.payload,x.stamp,x.stamp
     FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,payload jsonb,stamp timestamptz)`,
    [participant.id, JSON.stringify(rows)],
  );
}

try {
  await worker.verifyRole();
  await verifySchema(w.store.pool);
  await verifySchema(worker.pool);
  assert.equal(
    (await w.owner.query('SELECT count(*) FROM case_records')).rows[0]!.count,
    '0',
    'Browser setup requires a fresh empty test database; existing records are never reset or reused.',
  );
  const participant = await w.persona('participant'),
    member = await w.persona('member'),
    labor = await w.persona('labor'),
    fiscal = await w.persona('fiscal');

  // Both cohorts use actual synthetic eligibility, personal consent and roll commands.
  const closed = await w.association(participant, member, labor, 'Invented closed association');
  const voluntary = await w.association(
    participant,
    member,
    labor,
    'Invented voluntary invitation',
    false,
  );
  const larger = await largerInvitation(participant, member, labor);
  const compactId = await financePrerequisites(member, fiscal, closed.association);
  await olderActivity(participant);
  await olderRecords(participant);

  // Fail setup at its source if a required browser prerequisite is not actually readable.
  const currentParticipant = await w.actor(participant.id);
  assert.equal(closed.association.state, 'ready');
  assert.equal(closed.units.length, 2);
  assert.ok(currentParticipant.roles.includes('member'));
  assert.equal((await w.get(member, compactId))!.state, 'effective');
  assert.equal((await w.get(fiscal, compactId))!.state, 'effective');
  for (const [associationId, expected] of [
    [voluntary.association.id, '2'],
    [larger, '2501'],
  ] as const) {
    assert.equal(
      (
        await w.owner.query(
          "SELECT count(*) FROM founding_invitations WHERE association_id=$1 AND response='pending'",
          [associationId],
        )
      ).rows[0]!.count,
      expected,
    );
  }
  assert.equal((await w.store.notificationPage(currentParticipant)).unreadCount, 125);
  const page = await w.store.listPage(currentParticipant, { limit: 200 });
  assert.equal(page.records.length, 200);
  assert.ok(page.nextCursor);
  console.log(
    'Prepared isolated browser prerequisites: two-unit closed roll, separate voluntary invitations, 2,501-unit open cohort, unchanged synthetic finance compact, 125 old unread notifications and 205 old dossiers. Database integration suites run separately; no real authority is asserted.',
  );
} finally {
  await worker.close();
  await w.close();
}
