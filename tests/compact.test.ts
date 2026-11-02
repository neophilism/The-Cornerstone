import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CommercialMenuSchema,
  CompactBindingSchema,
  type Actor,
  type CaseRecord,
} from '@cornerstone/contracts';
import {
  parseFields,
  validateAction,
  validateCommercialTerms,
  workflow,
} from '@cornerstone/domain';
import type { Store, Transaction } from '@cornerstone/store';
import { digest } from '@cornerstone/security';
import {
  CompactService,
  compactPlan,
  frozenCompactFinancialSource,
} from '../apps/api/src/compacts.js';
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
  function delivery() {
    const { compact, offer, match } = fixture(),
      plan = compactPlan(compact, offer, match),
      resolutionId = randomUUID();
    const binding = {
      recordId: compact.id,
      associationId: plan.associationId,
      version: compact.version,
      digest: digest(plan),
      plan,
    };
    const published: CaseRecord = {
      ...compact,
      state: 'published',
      version: 5,
      data: {
        ...compact.data,
        publishedDate: '2026-01-01',
        memberResolutionId: resolutionId,
        approvedCompactVersion: binding.version,
        approvedCompactDigest: binding.digest,
        approvedResolutionVersion: 6,
        compactApproval: {
          resolutionId,
          resolutionVersion: 6,
          resolutionDigest: 'a'.repeat(64),
          associationId: plan.associationId,
          binding,
          unitCount: 2,
          yes: 2,
          no: 0,
          abstain: 0,
          notCast: 0,
          rollDigest: 'b'.repeat(64),
          source: 'verified-terminal-tally-at-submission',
        },
      },
    };
    // No access to the private source resolution is available to delivery staff.
    const records = new Map([
      [offer.id, offer],
      [match.id, match],
    ]);
    const store = {
      get: async (_tx: unknown, id: string) => records.get(id) ?? null,
    } as unknown as Store;
    const tx = { query: async () => ({ rows: [{ offer: null }] }) } as unknown as Transaction;
    const execute = (data = published.data) =>
      new CompactService(store).requireApproval(tx, {} as Actor, published, 'execute', data);
    return { published, offer, match, execute };
  }
  it('rechecks the complete member mandate at execution without reading private ballots', async () => {
    const { published, execute } = delivery();
    await expect(execute()).resolves.toBeUndefined();
    expect(published.data['initialYears']).toBe(30);
    expect(published.data['approvedCompactVersion']).toBe(1);
  });
  it.each([
    { services: 'Altered after publication' },
    { launchMilestones: 'Altered launch obligation' },
    { publicProtections: 'Altered protection' },
    { terms: { Lease: 'Short', Reporting: 'Quarterly' } },
    { approvedCompactVersion: 99 },
    { approvedCompactDigest: 'c'.repeat(64) },
    { memberResolutionId: randomUUID() },
    { compactApproval: undefined },
  ])('rejects altered or missing mandate at execution: %j', async (change) => {
    const { published, execute } = delivery();
    await expect(execute({ ...published.data, ...change })).rejects.toThrow();
  });
  it.each(['withdrawn', 'draft'])('refuses execution against a %s offer', async (state) => {
    const { offer, execute } = delivery();
    offer.state = state;
    await expect(execute()).rejects.toThrow();
  });
  it.each(['failed', 'declined'])('refuses execution against a %s match', async (state) => {
    const { match, execute } = delivery();
    match.state = state;
    await expect(execute()).rejects.toThrow();
  });
  it('refuses an offer revision even when its commercial choices still match', async () => {
    const { offer, execute } = delivery();
    offer.version++;
    await expect(execute()).rejects.toThrow(/exact unchanged/);
  });
  it('records effect only after the full publication period and on a reached date', () => {
    const { published } = delivery();
    const input = { effectiveDate: '2026-01-31', signatures: 'Invented signature reference' };
    expect(() => validateAction(published, 'execute', input, '2026-01-30')).toThrow(/period/);
    expect(() =>
      validateAction(published, 'execute', { ...input, effectiveDate: '2026-01-30' }, '2026-02-01'),
    ).toThrow(/effective date/);
    expect(() =>
      validateAction(published, 'execute', { ...input, effectiveDate: '2026-02-02' }, '2026-02-01'),
    ).toThrow(/future/);
    expect(validateAction(published, 'execute', input, '2026-01-31')['effectiveDate']).toBe(
      '2026-01-31',
    );
  });
  it('preserves effective compact financial terms without reopening a withdrawn offer', () => {
    const { compact, offer, match } = fixture(),
      plan = compactPlan(compact, offer, match);
    const resolutionId = randomUUID(),
      binding = {
        recordId: compact.id,
        associationId: plan.associationId,
        version: compact.version,
        digest: digest(plan),
        plan,
      };
    const approval = {
      resolutionId,
      resolutionVersion: 6,
      resolutionDigest: 'a'.repeat(64),
      associationId: plan.associationId,
      binding,
      unitCount: 2,
      yes: 2,
      no: 0,
      abstain: 0,
      notCast: 0,
      rollDigest: 'b'.repeat(64),
      source: 'verified-terminal-tally-at-submission',
    };
    const effective: CaseRecord = {
      ...compact,
      state: 'effective',
      version: 8,
      data: {
        ...compact.data,
        compactApproval: approval,
        memberResolutionId: resolutionId,
        approvedCompactVersion: binding.version,
        approvedCompactDigest: binding.digest,
        approvedResolutionVersion: 6,
        financialTerms: plan.offer.financialTerms,
      },
    };
    offer.state = 'withdrawn';
    offer.data['financialTerms'] = {
      ...plan.offer.financialTerms,
      rate: { numerator: '1', denominator: '10' },
    };
    expect(frozenCompactFinancialSource(effective)).toEqual({
      id: plan.offer.id,
      version: plan.offer.version,
      data: { financialTerms: plan.offer.financialTerms },
    });
    for (const change of [
      { offerId: randomUUID() },
      { associationId: randomUUID() },
      { matchId: randomUUID() },
      { memberResolutionId: randomUUID() },
      { approvedCompactVersion: 99 },
      { approvedCompactDigest: 'c'.repeat(64) },
      { approvedResolutionVersion: 99 },
      { financialTerms: offer.data['financialTerms'] },
      {
        compactApproval: {
          ...approval,
          binding: { ...binding, plan: { ...plan, title: 'Changed' } },
        },
      },
    ])
      expect(() =>
        frozenCompactFinancialSource({ ...effective, data: { ...effective.data, ...change } }),
      ).toThrow();
    expect(() => frozenCompactFinancialSource({ ...effective, state: 'published' })).toThrow();
    expect(frozenCompactFinancialSource({ ...compact, state: 'effective' })).toBeNull();
  });
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
