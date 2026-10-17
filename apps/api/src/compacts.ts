import {
  CompactPlanSchema,
  CompactBindingSchema,
  CompactApprovalSchema,
  CommercialMenuSchema,
  StateTermsSchema,
  IdSchema,
  PublishedStateOfferViewSchema,
  type PublishedStateOffer,
  type Actor,
  type CaseRecord,
  type CompactPlan,
} from '@cornerstone/contracts';
import { requireCondition, validateCommercialTerms } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

type CompactOffer = Pick<
  CaseRecord,
  'id' | 'kind' | 'state' | 'version' | 'title' | 'policyVersion' | 'data'
> & {
  publication?: PublishedStateOffer;
  publicationDigest?: string;
};
/** Excludes changing lifecycle metadata but binds every substantive compact field. */
export function compactPlan(
  record: CaseRecord,
  offer: CompactOffer,
  match: CaseRecord,
): CompactPlan {
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
      digest:
        offer.publicationDigest ??
        digest({
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
      ...(offer.publication ? { publication: offer.publication } : {}),
    },
    match: { id: match.id, roundId: match.data['roundId'], version: match.version },
  });
}

/** Existing effective obligations use the exact approval, even if future offers cease. */
export function frozenCompactFinancialSource(
  compact: CaseRecord,
): Pick<CaseRecord, 'id' | 'version' | 'data'> | null {
  if (compact.data['compactApproval'] === undefined) return null;
  const parsed = CompactApprovalSchema.safeParse(compact.data['compactApproval']);
  requireCondition(
    parsed.success,
    'COMPACT_FINANCIAL_BINDING',
    'The effective compact must retain its complete verified member approval.',
  );
  const approval = parsed.data,
    binding = approval.binding,
    plan = binding.plan,
    d = compact.data;
  requireCondition(
    compact.kind === 'compact' &&
      compact.state === 'effective' &&
      binding.recordId === compact.id &&
      binding.associationId === d['associationId'] &&
      binding.digest === digest(plan) &&
      binding.digest === d['approvedCompactDigest'] &&
      binding.version === d['approvedCompactVersion'] &&
      approval.resolutionId === d['memberResolutionId'] &&
      approval.resolutionVersion === d['approvedResolutionVersion'] &&
      plan.offer.id === d['offerId'] &&
      plan.matchId === d['matchId'] &&
      digest(plan.offer.financialTerms) === digest(d['financialTerms']),
    'COMPACT_FINANCIAL_BINDING',
    'The unchanged effective compact and frozen approved offer must identify the same financial obligations.',
  );
  if (plan.offer.publication) {
    const publication = plan.offer.publication;
    requireCondition(
      digest(publication) === plan.offer.digest &&
        publication.offerId === plan.offer.id &&
        publication.version === plan.offer.version &&
        digest(publication.financialTerms) === digest(plan.offer.financialTerms),
      'COMPACT_FINANCIAL_BINDING',
      'The financial obligation must retain the original published offer snapshot.',
    );
  }
  return {
    id: plan.offer.id,
    version: plan.offer.version,
    data: { financialTerms: plan.offer.financialTerms },
  };
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
    const published = (
      await tx.query('SELECT simulation_state_offer_choice($1) AS offer', [offerId])
    ).rows[0]?.offer;
    let offer: CompactOffer | null;
    if (published) {
      const view = PublishedStateOfferViewSchema.parse(published),
        p = view.publication;
      requireCondition(
        view.digest === digest(p),
        'STATE_PUBLICATION_INTEGRITY',
        'The exact published offer could not be verified.',
      );
      offer = {
        id: p.offerId,
        kind: 'offer',
        state: 'published',
        version: p.version,
        title: p.title,
        policyVersion: p.policyVersion,
        publication: p,
        publicationDigest: view.digest,
        data: {
          trade: p.trade,
          district: p.district,
          financialTerms: p.financialTerms,
          financialVersion: p.financialTerms.version,
          rateAct: p.financialTerms.rateActId,
          commercialMenu: p.commercialMenu,
        },
      };
    } else {
      offer = await this.store.get(tx, offerId);
      requireCondition(
        !offer?.data['stateOrigin'],
        'STATE_OFFER_UNAVAILABLE',
        'New compact choices require the exact current publication and unexpired, unwithdrawn authority.',
      );
    }
    const match = await this.store.get(tx, matchId);
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
