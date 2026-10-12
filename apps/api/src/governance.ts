import {
  OpportunityPlanSchema,
  OpportunityBindingSchema,
  IdSchema,
  type Actor,
  type CaseRecord,
  type Receipt,
} from '@cornerstone/contracts';
import { requireCondition } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

/** Only the stated plan is covered. Lifecycle fields, ballots and personal files are not a mandate. */
export function opportunityPlan(record: CaseRecord) {
  const d = record.data;
  return OpportunityPlanSchema.parse({
    kind: record.kind,
    recordId: record.id,
    associationId: d['associationId'],
    policyVersion: record.policyVersion,
    title: record.title,
    trade: d['trade'],
    district: d['district'],
    feasibility: d['feasibility'],
    trainingPlan: d['trainingPlan'],
    capitalPlan: d['capitalPlan'],
    permitPlan: d['permitPlan'],
    voluntary: d['voluntary'],
    shareWithMembers: d['shareWithMembers'],
  });
}
export class GovernanceService {
  constructor(readonly store: Store) {}
  private async member(tx: Transaction, actor: Actor, associationId: unknown) {
    IdSchema.parse(associationId);
    requireCondition(
      actor.realm === 'simulation' && actor.roles.includes('member'),
      'ACTIVE_FOUNDING_UNIT',
      'An active founding member is required for a shared member plan.',
    );
    const result = await tx.query('SELECT simulation_lock_plan_member($1) AS unit', [
      associationId,
    ]);
    requireCondition(
      result.rows[0]?.unit,
      'ACTIVE_FOUNDING_UNIT',
      'An unconflicted current founding unit in this closed association is required.',
    );
  }
  async prepareOpportunity(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
  ) {
    if (!['propose', 'adopt_plan', 'withdraw_plan'].includes(action)) return;
    await this.member(tx, actor, data['associationId']);
    if (action === 'propose') {
      requireCondition(
        actor.id === record.ownerId,
        'PLAN_OWNER',
        'Only the preparing member may share this plan.',
      );
      const plan = opportunityPlan({ ...record, data });
      data['proposalDigest'] = digest(plan);
      data['proposalVersion'] = record.version + 1;
      data['operatingAuthority'] = false;
    } else if (action === 'withdraw_plan') {
      requireCondition(
        actor.id === record.ownerId,
        'PLAN_OWNER',
        'Only the current founding member who proposed this plan may withdraw it.',
      );
    } else {
      const resolutionId = IdSchema.parse(data['memberResolutionId']);
      const resolution = await this.store.get(tx, resolutionId);
      requireCondition(
        resolution?.kind === 'resolution' &&
          resolution.state === 'tallied' &&
          resolution.data['approved'] === true &&
          resolution.data['decision'] === 'opportunity_plan',
        'MEMBER_PLAN_APPROVAL',
        'A tallied, approved opportunity-plan vote is required.',
      );
      const binding = OpportunityBindingSchema.parse(resolution.data['opportunityBinding']);
      const link = (
        await tx.query('SELECT * FROM opportunity_links WHERE opportunity_id=$1', [record.id])
      ).rows[0];
      requireCondition(
        link &&
          link.association_id === data['associationId'] &&
          resolution.data['associationId'] === data['associationId'] &&
          binding.recordId === record.id &&
          binding.associationId === data['associationId'] &&
          binding.version === record.version &&
          binding.version === link.proposal_version &&
          binding.digest === link.proposal_digest &&
          binding.digest === digest(binding.plan) &&
          binding.digest === digest(opportunityPlan(record)),
        'PLAN_BINDING_CHANGED',
        'Member approval must cover this exact unchanged shared proposal and association.',
      );
      data['adoptedResolutionId'] = resolution.id;
      data['adoptedResolutionVersion'] = resolution.version;
      data['adoptedProposalDigest'] = binding.digest;
      data['operatingAuthority'] = false;
    }
  }
  async share(tx: Transaction, record: CaseRecord, receipt: Receipt) {
    await tx.query('SELECT simulation_share_opportunity($1,$2,$3,$4,$5)', [
      record.id,
      record.data['associationId'],
      record.version,
      record.data['proposalDigest'],
      receipt.id,
    ]);
  }
  async bindResolution(tx: Transaction, actor: Actor, data: Record<string, unknown>) {
    if (data['decision'] !== 'opportunity_plan') {
      requireCondition(
        data['opportunityId'] === undefined,
        'UNRELATED_PLAN',
        'An opportunity reference belongs only to an opportunity-plan decision.',
      );
      delete data['opportunityBinding'];
      return;
    }
    await this.member(tx, actor, data['associationId']);
    const id = IdSchema.parse(data['opportunityId']);
    const record = await this.store.get(tx, id);
    requireCondition(
      record?.kind === 'opportunity' &&
        record.state === 'proposed' &&
        record.data['associationId'] === data['associationId'],
      'SHARED_MEMBER_PLAN',
      'Choose an accessible, unchanged proposed plan for this same association.',
    );
    const plan = opportunityPlan(record);
    const link = (await tx.query('SELECT * FROM opportunity_links WHERE opportunity_id=$1', [id]))
      .rows[0];
    requireCondition(
      link &&
        link.association_id === data['associationId'] &&
        link.proposal_version === record.version &&
        link.proposal_digest === digest(plan),
      'PLAN_BINDING_CHANGED',
      'The shared plan could not be verified.',
    );
    data['opportunityBinding'] = OpportunityBindingSchema.parse({
      recordId: id,
      associationId: data['associationId'],
      version: record.version,
      digest: digest(plan),
      plan,
    });
  }
  async assertResolutionBinding(tx: Transaction, actor: Actor, data: Record<string, unknown>) {
    if (data['decision'] !== 'opportunity_plan') return;
    const before = OpportunityBindingSchema.parse(data['opportunityBinding']);
    const current = { ...data };
    await this.bindResolution(tx, actor, current);
    requireCondition(
      digest(before) === digest(current['opportunityBinding']),
      'PLAN_BINDING_CHANGED',
      'This plan changed or was withdrawn. Save a fresh resolution draft before opening a vote.',
    );
  }
}
