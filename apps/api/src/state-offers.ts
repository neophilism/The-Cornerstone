import {
  DateSchema,
  IdSchema,
  PublishedOffersQuerySchema,
  PublishedStateOfferSchema,
  PublishedStateOfferViewSchema,
  StateAuthorityVerificationSchema,
  StateOfferBindingSchema,
  StateOriginSchema,
  StateTermsSchema,
  type Actor,
  type CaseRecord,
  type Receipt,
  type StateAuthorityVerification,
  type StateOfferBinding,
} from '@cornerstone/contracts';
import {
  DomainError,
  requireCondition,
  workflow,
  parseFields,
  statePacketOwner,
  independentStateReviewer,
  stateReviewActions,
} from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';

function draft(record: CaseRecord, data: Record<string, unknown>) {
  const fields = workflow(record.kind).createFields;
  return {
    id: record.id,
    title: record.title,
    policyVersion: record.policyVersion,
    data: parseFields(fields, Object.fromEntries(fields.map((f) => [f.key, data[f.key]]))),
  };
}
function terms(data: Record<string, unknown>) {
  const value = StateTermsSchema.parse(data['financialTerms']);
  requireCondition(
    value.version === data['financialVersion'] && value.rateActId === data['rateAct'],
    'STATE_FINANCIAL_TERMS_MISMATCH',
    'The prospective Rate Act, common method version and complete financial terms must agree.',
  );
  return value;
}
export function freezeStateAuthority(
  record: CaseRecord,
  actor: Actor,
  data: Record<string, unknown>,
  now: string,
) {
  requireCondition(
    record.kind === 'state_authority' &&
      record.state === 'submitted' &&
      independentStateReviewer(actor, record),
    'INDEPENDENT_STATE_REVIEWER_REQUIRED',
    'A current assigned supervisor independent of the proposer and commercial participants must verify this packet.',
  );
  requireCondition(
    data['packetComplete'] === true,
    'STATE_AUTHORITY_FINDINGS',
    'Confirm the complete synthetic authority packet and independent appointments.',
  );
  const origin = StateOriginSchema.parse(record.data['stateOrigin']),
    today = now.slice(0, 10);
  const effectiveFrom = DateSchema.parse(data['effectiveFrom']),
    validThrough = DateSchema.parse(data['validThrough']),
    rulesPublishedDate = DateSchema.parse(data['rulesPublishedDate']);
  requireCondition(
    data['jurisdiction'] === origin.jurisdiction && record.jurisdiction === origin.jurisdiction,
    'STATE_JURISDICTION_MISMATCH',
    'The packet must identify the current originating state jurisdiction.',
  );
  requireCondition(
    effectiveFrom <= today && validThrough >= today && rulesPublishedDate <= today,
    'STATE_AUTHORITY_DATES',
    'Record existing effective authority and final public rules, with an unexpired validity period.',
  );
  return StateAuthorityVerificationSchema.parse({
    schemaVersion: 1,
    authorityId: record.id,
    authorityVersion: record.version + 1,
    origin,
    verifierId: actor.id,
    verifierInstitutionId: actor.institutionId,
    verifiedAt: now,
    packetDigest: digest({
      packet: draft(record, data),
      reasons: data['reasons'],
      evidenceIds: data['evidenceIds'],
    }),
    enactmentReference: data['enactment'],
    appointmentReference: data['appointmentReference'],
    fiscalReportReference: data['fiscalReportReference'],
    supervisionResources: data['supervisionResources'],
    effectiveFrom,
    validThrough,
    rulesPublishedDate,
    financialTerms: terms(data),
  });
}

export function assertCurrentStateAuthority(
  authority: StateAuthorityVerification,
  current: { state: string; version: number; verification: unknown },
  now: string,
) {
  requireCondition(
    current.state === 'verified' &&
      current.version === authority.authorityVersion &&
      digest(current.verification) === digest(authority) &&
      authority.effectiveFrom <= now.slice(0, 10) &&
      authority.validThrough >= now.slice(0, 10) &&
      Date.parse(authority.verifiedAt) <= Date.parse(now),
    'STATE_AUTHORITY_UNAVAILABLE',
    'The exact verified authority revision must remain effective and unwithdrawn for this new offer action.',
  );
}
export function freezeStateOffer(
  record: CaseRecord,
  data: Record<string, unknown>,
  authority: StateAuthorityVerification,
) {
  const origin = StateOriginSchema.parse(record.data['stateOrigin']);
  requireCondition(
    record.kind === 'offer' &&
      data['authorityId'] === authority.authorityId &&
      origin.institutionId === authority.origin.institutionId &&
      origin.jurisdiction === authority.origin.jurisdiction &&
      record.jurisdiction === origin.jurisdiction,
    'STATE_AUTHORITY_MISMATCH',
    'Use the verified packet for the same originating state institution and jurisdiction.',
  );
  requireCondition(
    digest(terms(data)) === digest(authority.financialTerms),
    'STATE_FINANCIAL_TERMS_MISMATCH',
    'This offer must retain the exact prospective rate, method and baseline verified in its authority packet.',
  );
  return StateOfferBindingSchema.parse({
    schemaVersion: 1,
    recordId: record.id,
    submittedVersion: record.version + 1,
    origin,
    draftDigest: digest(draft(record, data)),
    authority,
  });
}
export function assertStateOfferBinding(
  record: CaseRecord,
  data: Record<string, unknown>,
  authority: StateAuthorityVerification,
): StateOfferBinding {
  const binding = StateOfferBindingSchema.parse(record.data['stateOfferBinding']),
    candidate = freezeStateOffer(record, data, authority);
  requireCondition(
    binding.recordId === record.id &&
      binding.submittedVersion <= record.version &&
      binding.draftDigest === candidate.draftDigest &&
      digest(binding.origin) === digest(candidate.origin) &&
      digest(binding.authority) === digest(authority),
    'STATE_OFFER_TERMS_CHANGED',
    'The submitted draft and exact authority revision are frozen. A material revision needs a new offer and publication.',
  );
  return binding;
}
export function publishStateOffer(
  record: CaseRecord,
  data: Record<string, unknown>,
  binding: StateOfferBinding,
  now: string,
) {
  requireCondition(
    data['publishDate'] === now.slice(0, 10),
    'STATE_PUBLICATION_DATE',
    'Use today’s synthetic publication date. Earlier form dates cannot create a past publication period.',
  );
  requireCondition(
    data['discloseTerms'] === true &&
      data['rightsProtected'] === true &&
      data['presentlyProhibited'] === true &&
      data['termsComplete'] === true,
    'STATE_PUBLICATION_FINDINGS',
    'Confirm the written findings and intentional disclosure of the listed public terms.',
  );
  const a = binding.authority;
  const earliest = new Date(
    Math.max(Date.parse(now), Date.parse(a.rulesPublishedDate + 'T00:00:00.000Z')) + 90 * 86400000,
  ).toISOString();
  // Enumerate every disclosed field. Never spread record.data, evidence or internal findings here.
  return PublishedStateOfferSchema.parse({
    schemaVersion: 1,
    synthetic: true,
    offerId: record.id,
    version: record.version + 1,
    title: record.title,
    jurisdiction: binding.origin.jurisdiction,
    policyVersion: record.policyVersion,
    trade: data['trade'],
    district: data['district'],
    readinessSummary: data['readinessSummary'],
    serviceObligations: data['serviceObligations'],
    launchRequirements: data['launchRequirements'],
    regulatoryTerms: data['regulatoryTerms'],
    publicProtections: data['publicProtections'],
    federalAuthority: data['federalAuthority'],
    publicFindings: data['publicFindings'],
    financialTerms: a.financialTerms,
    commercialMenu: data['commercialMenu'],
    initialYears: 30,
    renewalYears: 10,
    renewalLimit: 1,
    authority: {
      id: a.authorityId,
      version: a.authorityVersion,
      packetDigest: a.packetDigest,
      enactmentReference: a.enactmentReference,
      appointmentReference: a.appointmentReference,
      fiscalReportReference: a.fiscalReportReference,
      supervisionResources: a.supervisionResources,
      effectiveFrom: a.effectiveFrom,
      validThrough: a.validThrough,
      rulesPublishedDate: a.rulesPublishedDate,
    },
    publishedAt: now,
    earliestRankingsClose: earliest.slice(0, 10),
    earliestRankingsCloseAt: earliest,
  });
}

export class StateOfferService {
  constructor(readonly store: Store) {}
  origin(actor: Actor) {
    requireCondition(
      actor.realm === 'simulation' &&
        actor.assurance === 'privileged' &&
        actor.roles.includes('state'),
      'STATE_PACKET_OWNER_REQUIRED',
      'A current privileged synthetic state participant must prepare this packet.',
    );
    return StateOriginSchema.parse({
      actorId: actor.id,
      institutionId: actor.institutionId,
      jurisdiction: actor.jurisdiction,
    });
  }
  async checked<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === 'P0001' && e.message === 'STATE_RATE_ACT_CONFLICT')
        throw new DomainError(
          'STATE_RATE_ACT_CONFLICT',
          'This jurisdiction and Rate Act already bind a different positive percentage. No verification or new rate was saved.',
          409,
        );
      if (e.code === 'P0001' && e.message === 'STATE_REVIEW_ROUTE_UNAVAILABLE')
        throw new DomainError(
          'STATE_REVIEW_ROUTE_UNAVAILABLE',
          'A separate current independent supervisor must be available before this packet can be submitted. No submission was saved.',
          409,
        );
      if (e.code === 'P0001' && e.message === 'STATE_PACKET_SCOPE')
        throw new DomainError(
          'STATE_PACKET_SCOPE',
          'Current originating-state ownership or assigned independent supervision is required.',
          403,
        );
      if (e.code === 'P0001' && e.message === 'STATE_PUBLICATION_BINDING')
        throw new DomainError(
          'STATE_PUBLICATION_BINDING',
          'The accepted publication must retain the exact current authority, financial terms and receipt revision.',
          409,
        );
      throw error;
    }
  }
  async opened(tx: Transaction, record: CaseRecord, receipt: Receipt) {
    await this.checked(() =>
      tx.query('SELECT simulation_open_state_packet($1,$2)', [record.id, receipt.id]),
    );
  }
  async prepare(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
    now: string,
  ): Promise<{ data: Record<string, unknown>; institutionId?: string }> {
    const reviewer = stateReviewActions.includes(action);
    requireCondition(
      reviewer ? independentStateReviewer(actor, record) : statePacketOwner(actor, record),
      reviewer ? 'INDEPENDENT_STATE_REVIEWER_REQUIRED' : 'STATE_PACKET_OWNER_REQUIRED',
      reviewer
        ? 'Current assigned independent supervision is required; proposers and mixed state or commercial roles cannot review their own interests.'
        : 'The current originating state owner must perform this action.',
    );
    const scope = await tx.query(
      reviewer
        ? 'SELECT simulation_state_reviewer($1) AS allowed'
        : 'SELECT simulation_state_owner($1) AS allowed',
      [record.id],
    );
    requireCondition(
      scope.rows[0]?.allowed === true,
      reviewer ? 'INDEPENDENT_STATE_REVIEWER_REQUIRED' : 'STATE_PACKET_OWNER_REQUIRED',
      'Current database role, institution, jurisdiction, assignment and unconflicted standing are required.',
    );
    if (record.kind === 'state_authority') {
      if (action === 'verify')
        data['stateAuthorityVerification'] = freezeStateAuthority(record, actor, data, now);
    } else if (action === 'submit' || reviewer) {
      const rows = await this.checked(() =>
        tx.query('SELECT simulation_offer_authority($1,$2) AS context', [
          record.id,
          IdSchema.parse(data['authorityId']),
        ]),
      );
      const current = rows.rows[0]?.context as {
        state: string;
        version: number;
        verification: unknown;
      } | null;
      requireCondition(
        current,
        'STATE_AUTHORITY_UNAVAILABLE',
        'A verified packet from the same originating state is required.',
      );
      const authority = StateAuthorityVerificationSchema.parse(current.verification);
      assertCurrentStateAuthority(authority, current, now);
      if (action === 'submit')
        data['stateOfferBinding'] = freezeStateOffer(record, data, authority);
      else {
        const binding = assertStateOfferBinding(record, data, authority);
        if (action === 'publish')
          data['publishedStateOffer'] = publishStateOffer(record, data, binding, now);
      }
    }
    if (action === 'submit') {
      const route = await this.checked(() =>
        tx.query('SELECT simulation_route_state_packet($1) AS institution', [record.id]),
      );
      return { data, institutionId: IdSchema.parse(route.rows[0]?.institution) };
    }
    return { data };
  }
  async finish(tx: Transaction, record: CaseRecord, receipt: Receipt) {
    if (record.kind === 'state_authority' && receipt.action === 'verify')
      await this.checked(() =>
        tx.query('SELECT simulation_verify_state_authority($1,$2,$3::jsonb)', [
          record.id,
          receipt.id,
          JSON.stringify(
            StateAuthorityVerificationSchema.parse(record.data['stateAuthorityVerification']),
          ),
        ]),
      );
    if (record.kind === 'offer' && receipt.action === 'publish') {
      const publication = PublishedStateOfferSchema.parse(record.data['publishedStateOffer']);
      await this.checked(() =>
        tx.query('SELECT simulation_publish_state_offer($1,$2,$3::jsonb,$4)', [
          record.id,
          receipt.id,
          JSON.stringify(publication),
          digest(publication),
        ]),
      );
    }
  }
  async catalogue(actor: Actor, raw: unknown = {}) {
    requireCondition(
      actor.realm === 'simulation',
      'REALM_MISMATCH',
      'This catalogue contains only synthetic simulation offers.',
    );
    const query = PublishedOffersQuerySchema.parse(raw);
    const rows = await this.store.transaction(actor, (tx) =>
      tx.query('SELECT simulation_state_offer_catalogue($1,$2,$3) AS item', [
        query.offerId ?? null,
        query.after ?? null,
        query.limit + 1,
      ]),
    );
    const views = rows.rows.map((row) => {
      const view = PublishedStateOfferViewSchema.parse(row.item);
      requireCondition(
        view.digest === digest(view.publication),
        'STATE_PUBLICATION_INTEGRITY',
        'The immutable published snapshot could not be verified.',
      );
      return view;
    });
    const offers = views.slice(0, query.limit);
    return {
      offers,
      nextCursor: views.length > query.limit ? offers.at(-1)!.publication.offerId : null,
    };
  }
}
