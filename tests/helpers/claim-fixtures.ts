import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { addCalendarDays } from '@cornerstone/domain';
import { Simulation, findings } from './simulation.js';

export async function eventFixture(w: Simulation, owner: Actor, labor: Actor) {
  const event = await w.create(
    owner,
    'event_petition',
    'Invented claim-survival event ' + randomUUID(),
    {
      actionDate: '2000-01-01',
      actionText: 'Invented deliberate closure',
      industry: 'Invented lawful trade',
      objectiveEvidence: 'Invented primary record',
      contraryEvidence: 'Invented alternative causes considered',
    },
  );
  const evidence = await w.attach(owner, event);
  await w.command(owner, event, 'submit', { attested: true });
  await w.command(labor, event, 'open_record', {
    noticeDate: addCalendarDays(w.today, -61),
    publicDocket: 'invented-only',
  });
  await w.command(labor, event, 'close_record');
  await w.command(labor, event, 'certify', {
    implemented: true,
    lawfulIndustry: true,
    deliberateObjective: true,
    materialDirectGroup: true,
    firstLossDate: '2000-02-01',
    reasons: findings,
    evidenceIds: [evidence],
  });
  return (await w.get(owner, event.id))!;
}
export async function claimFixture(
  w: Simulation,
  owner: Actor,
  labor: Actor,
  event: CaseRecord,
  eligible = true,
) {
  const record = await w.create(owner, 'claim', 'Invented worker claim ' + randomUUID(), {
    eventId: event.id,
    workerType: 'employee',
    earnedIncomeShare: 0.75,
    lossDate: '2000-02-01',
    injuryDescription: 'Invented principal livelihood loss',
  });
  const evidenceId = await w.attach(owner, record);
  await w.command(owner, record, 'submit', { attested: true });
  await w.command(labor, record, 'begin_review');
  const input = { directInjuryProven: true, reasons: findings, evidenceIds: [evidenceId] };
  if (eligible) await w.command(labor, record, 'find_eligible', input);
  return { record: (await w.get(owner, record.id))!, input, evidenceId };
}
export async function openAssociationFixture(
  w: Simulation,
  owner: Actor,
  event: CaseRecord,
  units: { claimId: string; personId: string }[],
  title = 'Invented open cohort',
) {
  const record = await w.create(owner, 'association', title + ' ' + randomUUID(), {
    eventId: event.id,
    units,
    rollOpened: w.today,
    constitution:
      'One unit and vote; equal base rights; no forced work, capital, relocation or personal debt.',
  });
  await w.command(owner, record, 'submit', { attested: true });
  return (await w.get(owner, record.id))!;
}
export async function respondFixture(
  w: Simulation,
  person: Actor,
  association: CaseRecord,
  response: 'accepted' | 'declined' = 'accepted',
) {
  const actor = await w.actor(person.id);
  const invitation = (await w.members.list(actor)).invitations.find(
    (i) => i.associationId === association.id,
  )!;
  assert.ok(invitation);
  return w.members.respond(actor, {
    recordId: association.id,
    invitationId: invitation.id,
    expectedVersion: (await w.get(actor, association.id))!.version,
    idempotencyKey: randomUUID(),
    response,
    rightsAcknowledged: true,
  });
}
export async function closeAssociationFixture(
  w: Simulation,
  labor: Actor,
  association: CaseRecord,
) {
  const current = (await w.get(labor, association.id))!;
  if (current.state === 'submitted') await w.command(labor, current, 'begin_review');
  const before = w.day;
  w.day = addCalendarDays(w.today, 181);
  try {
    return await w.command(labor, association, 'close_roll', {
      pendingClaims: 0,
      equalRights: true,
      voluntary: true,
      reasons: findings,
    });
  } finally {
    w.day = before;
  }
}
export async function survivingRequestFixture(
  w: Simulation,
  candidate: Actor,
  labor: Actor,
  claim: CaseRecord,
  capacity = 'designated_successor',
  basis = 'holder_death',
) {
  const record = await w.create(
    candidate,
    'claim_survival',
    'Invented surviving claim request ' + randomUUID(),
    {
      claimId: claim.id,
      transferBasis: basis,
      capacity,
      chain: 'Invented death and single designation. No real legal proof.',
    },
  );
  const evidence = await w.attach(candidate, record);
  await w.command(candidate, record, 'submit', { attested: true, rightsAcknowledged: true });
  await w.command(labor, record, 'begin_review');
  return {
    record: (await w.get(candidate, record.id))!,
    input: {
      undivided: true,
      deathEstablished: true,
      identityEstablished: true,
      chainEstablished: true,
      probateConsistent: true,
      competingRightsResolved: true,
      caseAccessNecessary: true,
      eligibilitySeparate: true,
      legalBasis: findings,
      reasons: findings,
      evidenceIds: [evidence],
    },
  };
}
