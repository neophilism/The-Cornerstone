import {
  FinancialReviewSchema,
  type Actor,
  type CaseRecord,
  type Role,
} from '@cornerstone/contracts';
import { workflow } from './workflows.js';
import { statePacketOwner } from './state-offer.js';

export const financialAdjudicationActions = [
  'begin_calculation_review',
  'record_calculation_hearing',
  'decide_calculation_review',
];

export function independentFinancialReviewer(actor: Actor, record: CaseRecord): boolean {
  const parsed = FinancialReviewSchema.safeParse(record.data['financialReview']);
  if (record.kind !== 'financial_schedule' || !parsed.success) return false;
  const { basis, reviewInstitutionId } = parsed.data;
  const history = Array.isArray(record.data['history']) ? record.data['history'] : [];
  return (
    actor.realm === 'simulation' &&
    record.realm === actor.realm &&
    actor.assurance === 'privileged' &&
    actor.roles.includes('adjudicator') &&
    actor.institutionId === record.institutionId &&
    actor.institutionId === reviewInstitutionId &&
    actor.institutionId !== basis.institutionId &&
    actor.id !== basis.actorId &&
    actor.id !== record.ownerId &&
    actor.assignments.includes(record.id) &&
    !actor.conflicts.includes(record.id) &&
    !history.some((entry: unknown) => {
      const item = entry as { actorId?: unknown; action?: unknown } | null;
      return item?.actorId === actor.id && ['calculate', 'correct'].includes(String(item.action));
    })
  );
}

export function evidencePreparationRoles(record: CaseRecord): Role[] {
  if (record.state === 'draft' && !['sealed_ranking', 'draw', 'round'].includes(record.kind))
    return workflow(record.kind).createRoles;
  if (
    record.kind === 'financial_schedule' &&
    ['review_requested', 'calculation_review'].includes(record.state)
  )
    return ['member', 'adjudicator'];
  return [];
}

export function evidencePreparationStanding(actor: Actor, record: CaseRecord): boolean {
  if (['state_authority', 'offer'].includes(record.kind)) return statePacketOwner(actor, record);
  return (
    record.state === 'draft' ||
    actor.id === record.ownerId ||
    independentFinancialReviewer(actor, record)
  );
}
