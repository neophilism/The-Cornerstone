import { randomUUID } from 'node:crypto';
import type { Actor } from '@cornerstone/contracts';
import { Simulation } from './simulation.js';
import { financialSchedule, syntheticTerms } from './financial-data.js';

/** Explicit downstream prerequisites: no enacted offer, exchange result or compact execution. */
export async function financialReviewFixture(w: Simulation, member: Actor, fiscal: Actor) {
  const offerId = randomUUID(),
    compactId = randomUUID(),
    enterpriseId = randomUUID();
  for (const row of [
    { id: offerId, kind: 'offer', state: 'published', data: { financialTerms: syntheticTerms } },
    {
      id: compactId,
      kind: 'compact',
      state: 'effective',
      data: { offerId, associationId: enterpriseId },
    },
  ]) {
    await w.owner.query(
      "INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,policy_version,payload_cipher) VALUES($1,'simulation',$2,$3,1,$4,$5,'proposal-v1',$6)",
      [
        row.id,
        row.kind,
        row.state,
        member.id,
        fiscal.institutionId,
        w.store.seal(
          {
            title: 'Invented appeal prerequisite ' + row.id,
            data: { ...row.data, fixtureOnly: true, noActualAuthority: true },
          },
          `cornerstone:record:${row.id}:1`,
        ),
      ],
    );
  }
  await w.owner.query(
    'UPDATE actors SET assignments=array_cat(assignments,$2::uuid[]) WHERE id=$1',
    [fiscal.id, [offerId, compactId]],
  );
  const draft = await w.create(
    member,
    'financial_schedule',
    'Invented calculation appeal ' + randomUUID(),
    { compactId, fiscalYear: 2026, schedule: financialSchedule() },
  );
  await w.command(member, draft, 'submit', { attested: true });
  const calculated = (
    await w.command(fiscal, draft, 'calculate', {
      noticeDate: w.day,
      noticeReference: 'Invented calculation notice; not legal service',
    })
  ).record!;
  return { calculated, compactId, offerId, enterpriseId };
}

export async function financialStaff(w: Simulation, role: 'fiscal' | 'adjudicator') {
  const template = await w.persona(role),
    id = randomUUID();
  await w.owner.query(
    "INSERT INTO actors(id,realm,issuer,subject,roles,institution_id,jurisdiction,assurance) VALUES($1::uuid,'simulation','cornerstone:financial-tests',$1::text,$2,$3,'EX','privileged')",
    [id, [role], template.institutionId],
  );
  return w.actor(id);
}

export async function attachFinancialEvidence(w: Simulation, actor: Actor, recordId: string) {
  const current = (await w.get(actor, recordId))!;
  const filename = 'invented-financial-' + randomUUID() + '.txt';
  const saved = await w.evidence.upload(await w.actor(actor.id), {
    recordId,
    expectedVersion: current.version,
    idempotencyKey: randomUUID(),
    filename,
    description: 'Invented cash receipt or hearing support; no actual financial records',
    base64: Buffer.from(
      'Invented financial evidence only. No actual payment or identity data.',
    ).toString('base64'),
    attestedSynthetic: true,
  });
  const evidence = (await w.evidence.list(await w.actor(actor.id), recordId)).evidence.find(
    (item) => item.filename === filename,
  )!;
  await w.evidence.validate(await w.actor(actor.id), {
    recordId,
    evidenceId: evidence.id,
    expectedVersion: saved.record!.version,
    idempotencyKey: randomUUID(),
  });
  return evidence.id;
}
