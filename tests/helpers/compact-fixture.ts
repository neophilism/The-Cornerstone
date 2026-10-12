import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { Simulation } from './simulation.js';

export const noOutsideControl = {
  investorVotes: false,
  boardSeat: false,
  governanceVeto: false,
  unitPledge: false,
  compactForeclosure: false,
};
export const compactDraftDetails = {
  terms: { Lease: 'Standard', Reporting: 'Quarterly' },
  services: 'Invented service obligations only; no license or operation.',
  launchMilestones: 'Invented accessible preparation and funded launch milestones.',
  publicProtections:
    'Invented ordinary labor, safety, environment, consumer and civil rights protections.',
  investorRights: noOutsideControl,
};
/** Explicit downstream fixture. This does not run or attest offer authority or the disabled exchange. */
export async function compactPrerequisites(w: Simulation, member: Actor, association: CaseRecord) {
  const supervisor = await w.persona('supervisor'),
    offerId = randomUUID(),
    matchId = randomUUID();
  const now = new Date().toISOString();
  const method = {
    version: 'INVENTED-COMPACT-METHOD',
    rateActId: 'INVENTED-NOT-AN-ENACTED-RATE',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  };
  const rows: CaseRecord[] = [
    {
      id: offerId,
      kind: 'offer',
      state: 'published',
      title: 'Invented fixed offer ' + offerId,
      data: {
        trade: 'Invented prohibited trade',
        district: 'Invented district',
        rateAct: method.rateActId,
        financialVersion: method.version,
        financialTerms: method,
        commercialMenu: { Lease: ['Standard', 'Short'], Reporting: ['Quarterly', 'Monthly'] },
        fixtureOnly: true,
        noActualAuthority: true,
      },
      realm: 'simulation',
      version: 1,
      ownerId: member.id,
      institutionId: supervisor.institutionId,
      jurisdiction: 'EX',
      policyVersion: association.policyVersion,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: matchId,
      kind: 'match',
      state: 'accepted',
      title: 'Invented accepted-match fixture ' + matchId,
      data: {
        roundId: randomUUID(),
        offerId,
        associationId: association.id,
        fixtureOnly: true,
        noActualExchangeResult: true,
      },
      realm: 'simulation',
      version: 1,
      ownerId: member.id,
      institutionId: supervisor.institutionId,
      jurisdiction: 'EX',
      policyVersion: association.policyVersion,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const row of rows)
    await w.owner.query(
      `INSERT INTO case_records(id,realm,kind,state,version,owner_id,policy_version,jurisdiction,payload_cipher,institution_id)
     VALUES($1,'simulation',$2,$3,1,$4,$5,'EX',$6,$7)`,
      [
        row.id,
        row.kind,
        row.state,
        row.ownerId,
        row.policyVersion,
        w.store.seal({ title: row.title, data: row.data }, `cornerstone:record:${row.id}:1`),
        row.institutionId,
      ],
    );
  await w.owner.query(
    'UPDATE actors SET assignments=array_cat(assignments,$2::uuid[]) WHERE id=$1',
    [supervisor.id, [offerId, matchId, association.id]],
  );
  return {
    offer: rows[0]!,
    match: rows[1]!,
    supervisor,
    input: { ...compactDraftDetails, offerId, matchId, associationId: association.id },
  };
}
