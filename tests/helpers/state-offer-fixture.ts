import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';
import { addCalendarDays } from '@cornerstone/domain';
import { Simulation } from './simulation.js';
import { syntheticTerms } from './financial-data.js';

export function authorityInput(today: string, rateAct = 'INVENTED-RATE-ACT-' + randomUUID()) {
  return {
    jurisdiction: 'EX',
    enactment: 'Invented public enactment reference; no law asserted',
    sectorAuthority: 'INTERNAL sector authority working analysis',
    constitutionalReview: 'INTERNAL constitutional working analysis',
    rateAct,
    financialVersion: syntheticTerms.version,
    financialTerms: { ...syntheticTerms, rateActId: rateAct },
    fiscalReportReference: 'Invented independent public fiscal report reference',
    appointmentReference: 'Invented public appointment reference',
    supervisionResources: 'Invented funded supervision preparation',
    rulesPublishedDate: addCalendarDays(today, -90),
    effectiveFrom: addCalendarDays(today, -1),
    validThrough: addCalendarDays(today, 366),
    evidenceIds: [] as string[],
  };
}
export function offerInput(authority: CaseRecord) {
  return {
    authorityId: authority.id,
    trade: 'Invented presently prohibited trade',
    district: 'Invented mapped district source',
    noNewHarm: 'INTERNAL no-new-harm working analysis; not the disclosed finding',
    rateAct: authority.data['rateAct'],
    financialVersion: authority.data['financialVersion'],
    financialTerms: authority.data['financialTerms'],
    commercialMenu: { Lease: ['Standard', 'Short'], Reporting: ['Quarterly', 'Monthly'] },
    federalAuthority: 'Invented public federal-authority reference; no actual authority',
    readinessSummary: 'Invented public technical and financial readiness',
    serviceObligations: 'Invented public service obligations',
    launchRequirements: 'Invented public launch requirements',
    regulatoryTerms: 'Invented ordinary regulation and tax terms',
    publicProtections: 'Invented public protections and neutral end-of-term regime',
    evidenceIds: [] as string[],
  };
}
export function publicationInput(today: string) {
  return {
    rightsProtected: true,
    presentlyProhibited: true,
    termsComplete: true,
    discloseTerms: true,
    publishDate: today,
    publicFindings: 'Invented findings intentionally disclosed with these public terms',
    reasons: 'INTERNAL publication review reasons and deliberation; not disclosed',
  };
}
export async function stateStaff(w: Simulation, role: 'state' | 'supervisor') {
  const template = await w.persona(role),
    id = randomUUID();
  await w.owner.query(
    "INSERT INTO actors(id,realm,issuer,subject,roles,institution_id,jurisdiction,assurance) VALUES($1::uuid,'simulation','cornerstone:state-offer-tests',$1::text,$2,$3,'EX','privileged')",
    [id, [role], template.institutionId],
  );
  return w.actor(id);
}
export async function submittedAuthority(
  w: Simulation,
  state: Actor,
  input = authorityInput(w.today),
) {
  const record = await w.create(
    state,
    'state_authority',
    'Invented authority packet ' + randomUUID(),
    input,
  );
  const evidenceId = await w.attach(state, record);
  await w.command(state, record, 'submit', { attested: true });
  return { record: (await w.get(state, record.id))!, input, evidenceId };
}
export async function verifiedAuthority(
  w: Simulation,
  state: Actor,
  supervisor: Actor,
  input = authorityInput(w.today),
) {
  const result = await submittedAuthority(w, state, input);
  const record = (
    await w.command(supervisor, result.record, 'verify', {
      packetComplete: true,
      reasons: 'INTERNAL independent verification reasons',
      evidenceIds: [result.evidenceId],
    })
  ).record!;
  return { ...result, record };
}
export async function submittedOffer(w: Simulation, state: Actor, authority: CaseRecord) {
  const record = await w.create(
    state,
    'offer',
    'Invented offer ' + randomUUID(),
    offerInput(authority),
  );
  const evidenceId = await w.attach(state, record);
  await w.command(state, record, 'submit', { attested: true });
  return { record: (await w.get(state, record.id))!, evidenceId };
}
