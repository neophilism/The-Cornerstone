import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CommercialMenuSchema,
  CompactBindingSchema,
  type CaseRecord,
} from '@cornerstone/contracts';
import { parseFields, validateCommercialTerms, workflow } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { compactPlan } from '../apps/api/src/compacts.js';
import { compactDraftDetails } from './helpers/compact-fixture.js';
function fixture() {
  const associationId = randomUUID(),
    offerId = randomUUID(),
    matchId = randomUUID();
  const base = {
    realm: 'simulation' as const,
    version: 1,
    ownerId: randomUUID(),
    institutionId: null,
    jurisdiction: 'EX',
    policyVersion: 'proposal-v1',
    createdAt: '2026-01-01T12:00:00Z',
    updatedAt: '2026-01-01T12:00:00Z',
  };
  const method = {
    version: 'invented-v1',
    rateActId: 'INVENTED-NOT-ENACTED',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  };
  const offer: CaseRecord = {
    ...base,
    id: offerId,
    kind: 'offer',
    state: 'published',
    title: 'Invented offer',
    data: {
      trade: 'Invented trade',
      district: 'Invented district',
      financialTerms: method,
      financialVersion: method.version,
      rateAct: method.rateActId,
      commercialMenu: { Lease: ['Standard', 'Short'], Reporting: ['Quarterly', 'Monthly'] },
    },
  };
  const match: CaseRecord = {
    ...base,
    id: matchId,
    kind: 'match',
    state: 'accepted',
    title: 'Invented fixture',
    data: { roundId: randomUUID(), associationId, offerId },
  };
  const compact: CaseRecord = {
    ...base,
    id: randomUUID(),
    kind: 'compact',
    state: 'draft',
    title: 'Invented compact',
    data: { ...structuredClone(compactDraftDetails), associationId, offerId, matchId },
  };
  return { offer, match, compact };
}
describe('published commercial choices', () => {
  it('requires complete choices and never creates a default', () => {
    const menu = { Lease: ['Standard', 'Short'], Deposit: [null, 0, '0'] };
    expect(validateCommercialTerms(menu, { Lease: 'Short', Deposit: null })).toEqual({
      Lease: 'Short',
      Deposit: null,
    });
    expect(() => validateCommercialTerms(menu, {})).toThrow(/every published/);
    expect(() => validateCommercialTerms(menu, { Lease: 'Short' })).toThrow(/every published/);
    expect(() =>
      validateCommercialTerms(menu, { Lease: 'Short', Deposit: 0, Added: 'New' }),
    ).toThrow(/every published/);
    expect(() => validateCommercialTerms(menu, { Lease: 'New', Deposit: 0 })).toThrow(/outside/);
    expect(() => validateCommercialTerms({ Amount: [0] }, { Amount: '0' })).toThrow(/outside/);
  });
  it('allows an explicitly fixed offer with no negotiable choices', () => {
    expect(validateCommercialTerms({}, {})).toEqual({});
    expect(() => validateCommercialTerms({}, { Rate: 'new' })).toThrow();
  });
  it.each([
    null,
    [],
    { Lease: [] },
    { Lease: ['A', 'A'] },
    { Lease: [{}] },
    { Lease: [Infinity] },
    JSON.parse('{"__proto__":["A"]}'),
    { constructor: ['A'] },
    { Lease: Array.from({ length: 51 }, (_, i) => i) },
  ])('rejects malformed, unbounded or ambiguous menus', (menu) => {
    expect(CommercialMenuSchema.safeParse(menu).success).toBe(false);
  });
});
describe('compact mandate integrity', () => {
  it('binds each commercial choice and all substantive obligations', () => {
    const { compact, offer, match } = fixture(),
      original = digest(compactPlan(compact, offer, match));
    for (const change of [
      { services: 'Different service' },
      { launchMilestones: 'Different deadline' },
      { publicProtections: 'Different protection' },
      { terms: { Lease: 'Short', Reporting: 'Quarterly' } },
    ])
      expect(
        digest(compactPlan({ ...compact, data: { ...compact.data, ...change } }, offer, match)),
      ).not.toBe(original);
    expect(digest(compactPlan({ ...compact, title: 'Other title' }, offer, match))).not.toBe(
      original,
    );
    expect(
      digest(
        compactPlan(
          compact,
          { ...offer, data: { ...offer.data, extraCondition: 'Changed' } },
          match,
        ),
      ),
    ).not.toBe(original);
  });
  it('does not change the mandate because of lifecycle metadata', () => {
    const { compact, offer, match } = fixture();
    expect(
      compactPlan(
        {
          ...compact,
          state: 'review',
          version: 5,
          data: {
            ...compact.data,
            approvedCompactDigest: 'x',
            memberResolutionId: randomUUID(),
            reasons: 'Review reason',
          },
        },
        offer,
        match,
      ),
    ).toEqual(compactPlan(compact, offer, match));
  });
  it('rejects incomplete terms, mismatched matches, changed financial methods and outside control', () => {
    const { compact, offer, match } = fixture();
    expect(() =>
      compactPlan({ ...compact, data: { ...compact.data, terms: {} } }, offer, match),
    ).toThrow();
    expect(() =>
      compactPlan(compact, offer, {
        ...match,
        data: { ...match.data, associationId: randomUUID() },
      }),
    ).toThrow();
    expect(() => compactPlan(compact, { ...offer, state: 'withdrawn' }, match)).toThrow();
    expect(() =>
      compactPlan(
        compact,
        { ...offer, data: { ...offer.data, financialVersion: 'Changed' } },
        match,
      ),
    ).toThrow();
    expect(() =>
      compactPlan(
        {
          ...compact,
          data: {
            ...compact.data,
            investorRights: { ...compactDraftDetails.investorRights, boardSeat: true },
          },
        },
        offer,
        match,
      ),
    ).toThrow();
    expect(() =>
      compactPlan({ ...compact, data: { ...compact.data, services: '' } }, offer, match),
    ).toThrow();
  });
  it('rejects unrelated bindings and forged approval fields', () => {
    const { compact, offer, match } = fixture(),
      plan = compactPlan(compact, offer, match);
    expect(
      CompactBindingSchema.safeParse({
        recordId: randomUUID(),
        associationId: plan.associationId,
        version: 1,
        digest: digest(plan),
        plan,
      }).success,
    ).toBe(false);
    const wf = workflow('compact');
    expect(() =>
      parseFields(wf.createFields, { ...compact.data, approvedCompactDigest: 'forged' }),
    ).toThrow(/Unexpected field/);
    expect(() =>
      parseFields(workflow('resolution').createFields, {
        associationId: plan.associationId,
        decision: 'compact',
        compactId: compact.id,
        proposal: 'x',
        compactBinding: plan,
      }),
    ).toThrow(/Unexpected field/);
  });
});
