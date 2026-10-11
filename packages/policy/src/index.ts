import type { Actor, Mode, Realm } from '@cornerstone/contracts';
import { DomainError } from '@cornerstone/domain';

export type Authority = {
  id: string;
  realm: Realm;
  jurisdiction: string;
  function: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  withdrawn: boolean;
  enactedLawUrl: string;
  lawHash: string;
  verifiedBy: string[];
  appointedInstitutionId: string;
  prerequisites: Record<string, boolean>;
  reviewEvidenceId: string;
  policyVersion: string;
};
export const prerequisites: Record<string, string[]> = {
  event: [
    'federal_enactment',
    'labor_appointment',
    'notice_rules',
    'independent_review',
    'recovery_journal',
  ],
  claim: [
    'federal_enactment',
    'labor_appointment',
    'notice_rules',
    'identity_assurance',
    'independent_review',
    'recovery_journal',
  ],
  association: [
    'federal_enactment',
    'labor_appointment',
    'corporation_rules',
    'voting_review',
    'recovery_journal',
  ],
  offer: [
    'federal_enactment',
    'state_enabling',
    'sector_authority',
    'state_constitutional_review',
    'local_approvals',
    'rate_act',
    'financial_method',
    'no_new_harm',
    'supervisor_appointment',
    'supervision_funding',
  ],
  exchange: [
    'federal_enactment',
    'commerce_appointment',
    'published_round',
    'custody_review',
    'custodians',
    'recovery_journal',
  ],
  compact: [
    'state_enabling',
    'sector_authority',
    'state_constitutional_review',
    'rate_act',
    'financial_method',
    'supervisor_appointment',
    'ordinary_law',
    'required_permits',
    'signature_rules',
  ],
  fund: [
    'federal_enactment',
    'fund_appropriation',
    'fund_method',
    'fiscal_appointment',
    'treasury_acceptance',
    'recovery_journal',
  ],
  finance: [
    'state_enabling',
    'rate_act',
    'financial_method',
    'fiscal_appointment',
    'independent_finance_review',
    'treasury_acceptance',
    'recovery_journal',
  ],
  supervision: [
    'state_enabling',
    'sector_authority',
    'supervisor_appointment',
    'actual_supervision',
    'notice_rules',
    'independent_review',
  ],
  review: ['review_rules', 'adjudicator_appointment', 'notice_rules'],
};
export function assertAuthority(input: {
  mode: Mode;
  realm: Realm;
  actor: Actor;
  function: string;
  now: string;
  authorities: Authority[];
  jurisdiction: string | null;
  policyVersion: string;
}) {
  if (
    input.mode === 'simulation' &&
    input.realm === 'simulation' &&
    input.actor.realm === 'simulation'
  )
    return;
  if (input.mode !== 'authorized' || input.realm !== 'program' || input.actor.realm !== 'program')
    throw new DomainError(
      'AUTHORITY_UNAVAILABLE',
      'Official actions are unavailable in this proposal service.',
      403,
    );
  const a = input.authorities.find(
    (a) =>
      a.realm === 'program' &&
      a.function === input.function &&
      a.jurisdiction === input.jurisdiction &&
      a.policyVersion === input.policyVersion &&
      !a.withdrawn &&
      a.effectiveFrom <= input.now &&
      (!a.effectiveUntil || a.effectiveUntil > input.now) &&
      a.appointedInstitutionId === input.actor.institutionId,
  );
  if (
    !a ||
    new Set(a.verifiedBy).size < 2 ||
    !a.reviewEvidenceId ||
    !/^https:\/\//.test(a.enactedLawUrl) ||
    !/^[a-f0-9]{64}$/.test(a.lawHash) ||
    !(prerequisites[input.function] ?? ['unknown_function']).every(
      (p) => a.prerequisites[p] === true,
    )
  )
    throw new DomainError(
      'AUTHORITY_PREREQUISITE',
      'Verified enactment, appointment, rules, review, and function-specific prerequisites are required.',
      403,
    );
  if (input.actor.assurance !== 'privileged')
    throw new DomainError(
      'PRIVILEGED_AUTHENTICATION',
      'Use the authority-approved privileged authentication procedure.',
      403,
    );
}
export const draftPolicy = Object.freeze({
  version: 'draft-2026-09-28',
  eventEvidenceDays: 60,
  eventDecisionDays: 180,
  eventExtensionDays: 90,
  claimDecisionDays: 90,
  claimHearingDays: 60,
  foundingDays: 180,
  ordinaryUnitLimit: 2500,
  minimumUnits: 2,
  offerPublicationDays: 90,
  negotiationDays: 180,
  negotiationExtensionDays: 90,
  compactPublicationDays: 30,
  initialYears: 30,
  renewalYears: 10,
  workingCapitalMonths: 6,
  ordinaryAllowanceMonths: 36,
  growthLimit: { numerator: 1, denominator: 2 },
  annualFilingDays: 150,
  calculationAppealDays: 60,
  cureDays: 60,
  emergencyHearingDays: 10,
  stateRate: null,
});
