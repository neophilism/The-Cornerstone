import {
  CompactPlanSchema,
  CompactBindingSchema,
  CompactApprovalSchema,
  CommercialMenuSchema,
  StateTermsSchema,
  IdSchema,
  type Actor,
  type CaseRecord,
  type CompactPlan,
} from '@cornerstone/contracts';
import { requireCondition, validateCommercialTerms } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

/** Excludes changing lifecycle metadata but binds every substantive compact field. */
export function compactPlan(record: CaseRecord, offer: CaseRecord, match: CaseRecord): CompactPlan {
  const d = record.data;
  const terms = validateCommercialTerms(offer.data['commercialMenu'], d['terms']);
  requireCondition(
    offer.kind === 'offer' &&
      offer.state === 'published' &&
      offer.id === d['offerId'] &&
      match.kind === 'match' &&
      match.state === 'accepted' &&
      match.id === d['matchId'] &&
      match.data['offerId'] === offer.id &&
      match.data['associationId'] === d['associationId'],
    'COMPACT_PREREQUISITES',
    'A published offer and the accepted match for this exact association are required.',
  );
  const financialTerms = StateTermsSchema.parse(offer.data['financialTerms']);
  requireCondition(
    financialTerms.version === offer.data['financialVersion'] &&
      financialTerms.rateActId === offer.data['rateAct'],
    'PUBLISHED_FINANCIAL_METHOD',
    'The offer must fix one matching published rate act and financial method.',
  );
  return CompactPlanSchema.parse({
    kind: record.kind,
    recordId: record.id,
    associationId: d['associationId'],
    offerId: offer.id,
    matchId: match.id,
    policyVersion: record.policyVersion,
    title: record.title,
    terms,
    services: d['services'],
    launchMilestones: d['launchMilestones'],
    publicProtections: d['publicProtections'],
    investorRights: d['investorRights'],
    initialYears: 30,
    renewalYears: 10,
    renewalLimit: 1,
    offer: {
      id: offer.id,
      version: offer.version,
      digest: digest({
        id: offer.id,
        version: offer.version,
        title: offer.title,
        policyVersion: offer.policyVersion,
        data: offer.data,
      }),
      title: offer.title,
      trade: offer.data['trade'],
      district: offer.data['district'],
      financialTerms,
      commercialMenu: CommercialMenuSchema.parse(offer.data['commercialMenu']),
    },
    match: { id: match.id, roundId: match.data['roundId'], version: match.version },
  });
}
export class CompactService {
  constructor(readonly store: Store) {}
  private async snapshot(tx: Transaction, record: CaseRecord) {
    const offerId = IdSchema.parse(record.data['offerId']),
      matchId = IdSchema.parse(record.data['matchId']);
    // Lock in a stable order; an offer withdrawal or match failure cannot race the approval check.
    await tx.query('SELECT id FROM case_records WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [
      [offerId, matchId],
    ]);
    const offer = await this.store.get(tx, offerId),
      match = await this.store.get(tx, matchId);
    requireCondition(
      offer && match,
      'COMPACT_PREREQUISITES',
      'Accessible published offer and accepted-match records are required.',
    );
    return compactPlan(record, offer, match);
  }
  private async member(tx: Transaction, actor: Actor, association: unknown) {
    const id = IdSchema.parse(association);
    requireCondition(
      actor.realm === 'simulation' &&
        actor.roles.includes('member') &&
        (await tx.query('SELECT simulation_lock_plan_member($1) AS unit', [id])).rows[0]?.unit,
      'ACTIVE_FOUNDING_UNIT',
      'A current unconflicted founding member of this association is required.',
    );
  }
  async bindResolution(tx: Transaction, actor: Actor, data: Record<string, unknown>) {
    if (data['decision'] !== 'compact') {
      requireCondition(
        data['compactId'] === undefined,
        'UNRELATED_COMPACT',
        'A proposed compact reference belongs only to a compact decision.',
      );
      delete data['compactBinding'];
      return;
    }
    await this.member(tx, actor, data['associationId']);
    requireCondition(
      data['shareCompactTerms'] === true,
      'COMPACT_DISCLOSURE_CONSENT',
      'Explicitly authorize disclosure of the complete frozen compact terms to founding members when the vote opens.',
    );
    const id = IdSchema.parse(data['compactId']);
    const record = await this.store.get(tx, id, true);
    requireCondition(
      record?.kind === 'compact' &&
        record.state === 'draft' &&
        record.data['associationId'] === data['associationId'],
      'COMPACT_DRAFT_REQUIRED',
      'Choose an accessible complete compact draft for this same association.',
    );
    const plan = await this.snapshot(tx, record);
    data['compactBinding'] = CompactBindingSchema.parse({
      recordId: id,
      associationId: data['associationId'],
      version: record.version,
      digest: digest(plan),
      plan,
    });
  }
  async assertResolutionBinding(tx: Transaction, actor: Actor, data: Record<string, unknown>) {
    if (data['decision'] !== 'compact') return;
    const before = CompactBindingSchema.parse(data['compactBinding']),
      fresh = { ...data };
    await this.bindResolution(tx, actor, fresh);
    requireCondition(
      digest(before) === digest(fresh['compactBinding']),
      'COMPACT_BINDING_CHANGED',
      'The compact, offer or accepted match changed. Save a fresh resolution before opening a vote.',
    );
  }
  async requireApproval(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
  ) {
    if (!['submit', 'publish'].includes(action)) return;
    if (action === 'submit') await this.member(tx, actor, data['associationId']);
    const plan = await this.snapshot(tx, { ...record, data });
    const id = IdSchema.parse(data['memberResolutionId']);
    if (action === 'submit') {
      const resolution = await this.store.get(tx, id);
      requireCondition(
        resolution?.kind === 'resolution' &&
          resolution.state === 'tallied' &&
          resolution.data['approved'] === true &&
          resolution.data['decision'] === 'compact' &&
          resolution.data['associationId'] === data['associationId'],
        'COMPACT_APPROVAL',
        'A tallied majority-of-all compact decision for this association is required.',
      );
      // The terminal tally is immutable. Copy only the necessary aggregate approval, never private ballots.
      // This avoids granting the separate compact reviewer access to a member's private voting record.
      data['compactApproval'] = CompactApprovalSchema.parse({
        resolutionId: id,
        resolutionVersion: resolution.version,
        resolutionDigest: digest(resolution),
        associationId: data['associationId'],
        binding: resolution.data['compactBinding'],
        unitCount: resolution.data['unitCount'],
        yes: resolution.data['yes'],
        no: resolution.data['no'],
        abstain: resolution.data['abstain'],
        notCast: resolution.data['notCast'],
        rollDigest: resolution.data['rollDigest'],
        source: 'verified-terminal-tally-at-submission',
      });
    }
    const approval = CompactApprovalSchema.parse(data['compactApproval']);
    requireCondition(
      approval.resolutionId === id && approval.associationId === data['associationId'],
      'COMPACT_APPROVAL',
      'The recorded member approval is for a different compact or association.',
    );
    const binding = approval.binding;
    requireCondition(
      binding.recordId === record.id &&
        binding.associationId === data['associationId'] &&
        binding.digest === digest(binding.plan) &&
        binding.digest === digest(plan) &&
        binding.version ===
          (action === 'submit' ? record.version : data['approvedCompactVersion']) &&
        (action === 'submit' || binding.digest === data['approvedCompactDigest']),
      'COMPACT_BINDING_CHANGED',
      'Member approval must cover this exact unchanged compact version, offer, financial method and complete commercial choices.',
    );
    data['approvedCompactVersion'] = binding.version;
    data['approvedCompactDigest'] = binding.digest;
    data['approvedResolutionVersion'] = approval.resolutionVersion;
    data['financialTerms'] = plan.offer.financialTerms;
    data['initialYears'] = plan.initialYears;
    data['renewalYears'] = plan.renewalYears;
    data['renewalCount'] = 0;
  }
}
