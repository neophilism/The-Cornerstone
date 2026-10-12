import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OpportunityBindingSchema, type CaseRecord } from '@cornerstone/contracts';
import { validateAction, workflow, parseFields } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { opportunityPlan } from '../apps/api/src/governance.js';
const record: CaseRecord = {
  id: randomUUID(),
  kind: 'opportunity',
  realm: 'simulation',
  ownerId: randomUUID(),
  state: 'proposed',
  version: 3,
  policyVersion: 'proposal-v1',
  title: 'Invented plan',
  institutionId: null,
  jurisdiction: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  data: {
    associationId: randomUUID(),
    trade: 'Invented trade',
    district: 'Invented district',
    feasibility: 'Invented feasibility',
    trainingPlan: 'Accessible optional training',
    capitalPlan: 'Enterprise-only finance',
    permitPlan: 'Ordinary permits still needed',
    voluntary: true,
    shareWithMembers: true,
  },
};
describe('exact voluntary member plans', () => {
  it('binds every substantive plan field, title, identity and policy version', () => {
    const plan = opportunityPlan(record);
    for (const field of [
      'trade',
      'district',
      'feasibility',
      'trainingPlan',
      'capitalPlan',
      'permitPlan',
    ])
      expect(
        digest(opportunityPlan({ ...record, data: { ...record.data, [field]: 'Changed' } })),
      ).not.toBe(digest(plan));
    for (const field of ['title', 'policyVersion'])
      expect(digest(opportunityPlan({ ...record, [field]: 'Changed' }))).not.toBe(digest(plan));
    expect(digest(opportunityPlan({ ...record, id: randomUUID() }))).not.toBe(digest(plan));
  });
  it('does not change the proposal digest with lifecycle bookkeeping', () => {
    expect(
      digest(
        opportunityPlan({
          ...record,
          version: 4,
          state: 'adopted',
          data: {
            ...record.data,
            history: [{ action: 'adopt_plan' }],
            adoptedResolutionId: randomUUID(),
          },
        }),
      ),
    ).toBe(digest(opportunityPlan(record)));
  });
  it('requires explicit sharing and protects each individual from compulsory participation', () => {
    for (const field of ['voluntary', 'shareWithMembers']) {
      expect(() =>
        opportunityPlan({ ...record, data: { ...record.data, [field]: false } }),
      ).toThrow();
      expect(() =>
        validateAction(record, 'propose', { ...record.data, [field]: false }, '2026-10-12'),
      ).toThrow();
    }
    expect(() => validateAction(record, 'mark_ready', { attested: false }, '2026-10-12')).toThrow();
  });
  it('rejects mismatched identities and malformed proposal versions in bindings', () => {
    const plan = opportunityPlan(record),
      binding = {
        recordId: record.id,
        associationId: plan.associationId,
        version: record.version,
        digest: digest(plan),
        plan,
      };
    expect(OpportunityBindingSchema.safeParse(binding).success).toBe(true);
    for (const change of [
      { recordId: randomUUID() },
      { associationId: randomUUID() },
      { version: 0 },
      { digest: 'forged' },
    ])
      expect(OpportunityBindingSchema.safeParse({ ...binding, ...change }).success).toBe(false);
  });
  it('cannot submit a forged approval, digest, plan binding or authority through forms', () => {
    for (const key of ['approved', 'opportunityBinding', 'proposalDigest', 'operatingAuthority'])
      expect(() =>
        parseFields(workflow('resolution').createFields, {
          associationId: randomUUID(),
          decision: 'opportunity_plan',
          proposal: 'Invented proposal',
          opportunityId: randomUUID(),
          [key]: true,
        }),
      ).toThrow(/Unexpected field/);
  });
  it('retains personal preparation and allows no edits or operating transition after sharing', () => {
    const definition = workflow('opportunity');
    expect(definition.createFields.map((f) => f.key)).toEqual(['trade', 'district', 'feasibility']);
    expect(definition.actions.filter((a) => a.from.includes('proposed')).map((a) => a.key)).toEqual(
      ['adopt_plan', 'withdraw_plan'],
    );
    expect(definition.actions.some((a) => a.from.includes('adopted'))).toBe(false);
    expect(definition.actions.find((a) => a.key === 'adopt_plan')?.authority).toBe(null);
  });
});
