import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { Simulation, findings } from './simulation.js';

export const standingFindings = {
  undivided: true,
  deathEstablished: true,
  identityEstablished: true,
  chainEstablished: true,
  probateConsistent: true,
  competingRightsResolved: true,
  caseAccessNecessary: true,
  eligibilitySeparate: true,
};
export function eligibilityPreparation(event: CaseRecord) {
  return {
    eventId: event.id,
    workerType: 'employee',
    earnedIncomeShare: 0.75,
    injuryDescription: 'Invented deceased worker’s original direct livelihood loss.',
    lossDate: '2000-02-01',
  };
}
export async function deceasedFilingFixture(
  w: Simulation,
  applicant: Actor,
  worker: Actor,
  labor: Actor,
  capacity = 'designated_successor',
) {
  const draft = await w.create(
    applicant,
    'deceased_filing',
    'Invented new deceased-worker packet ' + randomUUID(),
    { workerId: worker.id, capacity, chain: findings },
  );
  const evidence = await w.attach(applicant, draft);
  await w.command(applicant, draft, 'submit', { attested: true, rightsAcknowledged: true });
  await w.command(labor, draft, 'begin_review');
  return {
    record: (await w.get(applicant, draft.id))!,
    input: {
      ...standingFindings,
      legalBasis: findings,
      reasons: findings,
      evidenceIds: [evidence],
    },
  };
}
