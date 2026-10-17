import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type Actor, type CaseRecord, FinancialReviewSchema } from '@cornerstone/contracts';
import {
  evidencePreparationRoles,
  evidencePreparationStanding,
  independentFinancialReviewer,
  parseFields,
  workflow,
} from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import {
  freezeFinancialBasis,
  financialReviewRequest,
  financialReviewDecision,
} from '../apps/api/src/financial-review.js';
import { calculateWireSchedule } from '../apps/api/src/financial-calculation.js';
import { financialSchedule, syntheticTerms } from './helpers/financial-data.js';

function fixture() {
  const now = '2026-10-01T12:00:00Z';
  const member: Actor = {
    id: randomUUID(),
    realm: 'simulation',
    roles: ['member'],
    institutionId: null,
    jurisdiction: 'EX',
    assurance: 'draft',
    assignments: [],
    conflicts: [],
    authenticationTime: now,
  };
  const fiscal: Actor = {
    ...member,
    id: randomUUID(),
    roles: ['fiscal'],
    assurance: 'privileged',
    institutionId: randomUUID(),
  };
  const reviewer: Actor = {
    ...fiscal,
    id: randomUUID(),
    roles: ['adjudicator'],
    institutionId: randomUUID(),
  };
  const submitted: CaseRecord = {
    id: randomUUID(),
    kind: 'financial_schedule',
    realm: 'simulation',
    state: 'submitted',
    version: 2,
    ownerId: member.id,
    institutionId: fiscal.institutionId,
    jurisdiction: 'EX',
    policyVersion: 'proposal-v1',
    title: 'Invented independent calculation review',
    data: {},
    createdAt: now,
    updatedAt: now,
  };
  const offer: CaseRecord = {
    ...submitted,
    id: randomUUID(),
    kind: 'offer',
    state: 'published',
    version: 4,
    data: { financialTerms: syntheticTerms },
  };
  const enterpriseId = randomUUID();
  const compact: CaseRecord = {
    ...submitted,
    id: randomUUID(),
    kind: 'compact',
    state: 'effective',
    version: 5,
    data: { offerId: offer.id, associationId: enterpriseId },
  };
  const schedule = financialSchedule();
  const calculation = calculateWireSchedule({
    ...schedule,
    terms: syntheticTerms,
    enterpriseId,
    year: 2026,
  });
  const data = {
    compactId: compact.id,
    fiscalYear: 2026,
    schedule,
    calculation,
    noticeDate: '2026-10-01',
    noticeReference: 'Invented calculation notice; no legal service',
  };
  const basis = freezeFinancialBasis(submitted, data, fiscal, compact, offer, now);
  const calculated: CaseRecord = {
    ...submitted,
    version: 3,
    state: 'calculated',
    data: { ...data, financialBasis: basis },
  };
  const request = {
    disputedAmount: '5.00',
    reasons: 'Invented operating-cost classification appeal',
  };
  const review = financialReviewRequest(calculated, member, request, now, reviewer.institutionId!);
  const evidence = [
    {
      id: randomUUID(),
      plaintextSha256: 'a'.repeat(64),
      checkedAt: now,
      checkMethod: 'synthetic_text_v1' as const,
    },
  ];
  const heardReview = FinancialReviewSchema.parse({
    ...review,
    status: 'heard',
    hearing: { date: '2026-10-01', noticeReference: 'Invented hearing notice' },
    hearingRecord: {
      recordedAt: now,
      reviewerId: reviewer.id,
      recordVersion: 8,
      account: 'Invented hearing and contrary evidence considered',
      evidence,
      evidenceDigest: digest(evidence),
    },
  });
  const heard: CaseRecord = {
    ...calculated,
    state: 'calculation_heard',
    version: 8,
    institutionId: reviewer.institutionId,
    data: {
      ...calculated.data,
      financialReview: heardReview,
      evidenceIds: evidence.map((e) => e.id),
    },
  };
  reviewer.assignments = [heard.id];
  const decision = {
    disposition: 'correct',
    schedule: financialSchedule('200.00'),
    reasons: 'Invented receipt correction under original terms',
    judicialReviewRoute: 'Invented statutory court route; no court filing performed',
  };
  return {
    now,
    member,
    fiscal,
    reviewer,
    submitted,
    compact,
    offer,
    calculated,
    basis,
    request,
    review,
    heard,
    decision,
  };
}

describe('source-bound synthetic calculation appeals', () => {
  it('freezes the published method and historical compact, offer and calculation versions', () => {
    const f = fixture();
    expect(f.basis).toMatchObject({
      recordVersion: 3,
      compactVersion: 5,
      offerVersion: 4,
      terms: syntheticTerms,
      noticeDate: '2026-10-01',
    });
    expect(f.review.originalCalculation.statePayment).toBe('45.00');
    expect(f.review.disputedAmount).toBe('5.00');
    expect(f.review.undisputedAmount).toBe('40.00');
    expect(f.review.filingDeadline).toBe('2026-11-30');
  });
  it.each([
    ['2026-11-30T23:59:59Z', true],
    ['2026-12-01T00:00:00Z', false],
    ['2026-09-30T23:59:59Z', false],
  ])('uses the inclusive calendar deadline at %s', (now, accepted) => {
    const f = fixture();
    const request = () =>
      financialReviewRequest(f.calculated, f.member, f.request, now, f.reviewer.institutionId!);
    if (accepted) expect(request().filingDeadline).toBe('2026-11-30');
    else expect(request).toThrow(/60 calendar days/);
  });
  it('rejects future notice and silent changes to the fixed method during correction', () => {
    const f = fixture();
    expect(() =>
      freezeFinancialBasis(
        f.submitted,
        { ...f.calculated.data, noticeDate: '2026-10-02' },
        f.fiscal,
        f.compact,
        f.offer,
        f.now,
      ),
    ).toThrow(/future service/);
    for (const financialTerms of [
      { ...syntheticTerms, version: 'different-method' },
      { ...syntheticTerms, rate: { numerator: '1', denominator: '10' } },
    ])
      expect(() =>
        freezeFinancialBasis(
          f.calculated,
          f.calculated.data,
          f.fiscal,
          f.compact,
          { ...f.offer, data: { financialTerms } },
          f.now,
        ),
      ).toThrow(/published rate and method/);
  });
  it('allows a zero-value classification appeal and rejects an amount above the calculation', () => {
    const f = fixture();
    expect(
      financialReviewRequest(
        f.calculated,
        f.member,
        { ...f.request, disputedAmount: '0.00' },
        f.now,
        f.reviewer.institutionId!,
      ).undisputedAmount,
    ).toBe('45.00');
    expect(() =>
      financialReviewRequest(
        f.calculated,
        f.member,
        { ...f.request, disputedAmount: '45.01' },
        f.now,
        f.reviewer.institutionId!,
      ),
    ).toThrow(/cannot exceed/);
  });
  it('rejects mismatched schedules and calculation digests before routing an appeal', () => {
    const f = fixture();
    for (const changed of [
      { schedule: financialSchedule('200.00') },
      { calculation: { statePayment: '0.00' } },
      { fiscalYear: 2027 },
      { compactId: randomUUID() },
    ])
      expect(() =>
        financialReviewRequest(
          { ...f.calculated, data: { ...f.calculated.data, ...changed } },
          f.member,
          f.request,
          f.now,
          f.reviewer.institutionId!,
        ),
      ).toThrow(/fixed financial basis/);
  });
  it('corrects inputs in exact cents while retaining the original calculation and frozen evidence', () => {
    const f = fixture(),
      before = structuredClone(f.heard);
    const result = financialReviewDecision(f.heard, f.reviewer, f.decision, f.now);
    expect(result.calculation.statePayment).toBe('40.00');
    expect(result.review.originalCalculation.statePayment).toBe('45.00');
    expect(result.review.decision).toMatchObject({
      adjustment: '-5.00',
      originalStatePayment: '45.00',
      reviewedStatePayment: '40.00',
      hearingRecordVersion: 8,
      evidenceDigest: result.review.hearingRecord!.evidenceDigest,
    });
    expect(result.review.basis.terms).toEqual(syntheticTerms);
    expect(f.heard).toEqual(before);
  });
  it('affirmation keeps exact original inputs; invalid correction leaves the original record intact', () => {
    const f = fixture(),
      before = structuredClone(f.heard);
    const affirmed = financialReviewDecision(
      f.heard,
      f.reviewer,
      { ...f.decision, disposition: 'affirm', schedule: f.review.originalSchedule },
      f.now,
    );
    expect(affirmed.review.decision?.adjustment).toBe('0.00');
    expect(() =>
      financialReviewDecision(f.heard, f.reviewer, { ...f.decision, disposition: 'affirm' }, f.now),
    ).toThrow(/Affirm the original inputs/);
    const schedule = financialSchedule();
    schedule.costs.push({ ...schedule.costs[0]!, id: 'second-entry-for-same-source' });
    expect(() =>
      financialReviewDecision(f.heard, f.reviewer, { ...f.decision, schedule }, f.now),
    ).toThrow(/cannot be deducted again/);
    expect(() =>
      financialReviewDecision(
        f.heard,
        f.reviewer,
        {
          ...f.decision,
          schedule: {
            ...financialSchedule(),
            terms: { ...syntheticTerms, rate: { numerator: '0', denominator: '1' } },
          },
        },
        f.now,
      ),
    ).toThrow();
    expect(f.heard).toEqual(before);
  });
  it('denies owner and mixed-role self-review, original institution, missing assignment and conflicts', () => {
    const f = fixture();
    for (const actor of [
      { ...f.reviewer, id: f.member.id, roles: ['member', 'adjudicator'] as Actor['roles'] },
      { ...f.reviewer, id: f.fiscal.id },
      { ...f.reviewer, institutionId: f.fiscal.institutionId },
      { ...f.reviewer, assignments: [] },
      { ...f.reviewer, conflicts: [f.heard.id] },
      { ...f.reviewer, roles: ['member'] as Actor['roles'] },
      { ...f.reviewer, assurance: 'verified' as const },
    ]) {
      expect(independentFinancialReviewer(actor, f.heard)).toBe(false);
      expect(() => financialReviewDecision(f.heard, actor, f.decision, f.now)).toThrow(
        /unconflicted adjudicator/,
      );
    }
    const prior = {
      ...f.heard,
      data: { ...f.heard.data, history: [{ action: 'correct', actorId: f.reviewer.id }] },
    };
    expect(independentFinancialReviewer(f.reviewer, prior)).toBe(false);
  });
  it('requires a completed hearing and its exact evidence revision', () => {
    const f = fixture();
    expect(() =>
      financialReviewDecision(
        { ...f.heard, state: 'calculation_review' },
        f.reviewer,
        f.decision,
        f.now,
      ),
    ).toThrow(/hearing record/);
    expect(() =>
      financialReviewDecision(f.heard, f.reviewer, f.decision, '2026-09-30T12:00:00Z'),
    ).toThrow(/hearing record/);
    for (const changed of [
      { ...f.heard, version: 9 },
      { ...f.heard, data: { ...f.heard.data, evidenceIds: [randomUUID()] } },
    ])
      expect(() => financialReviewDecision(changed, f.reviewer, f.decision, f.now)).toThrow(
        /evidence revision/,
      );
  });
  it('opens attachments only before hearing closure and preserves independent reviewer standing', () => {
    const f = fixture(),
      open = { ...f.heard, state: 'calculation_review' };
    expect(evidencePreparationRoles(open)).toEqual(['member', 'adjudicator']);
    expect(evidencePreparationStanding(f.member, open)).toBe(true);
    expect(evidencePreparationStanding(f.reviewer, open)).toBe(true);
    expect(evidencePreparationStanding({ ...f.reviewer, conflicts: [open.id] }, open)).toBe(false);
    expect(evidencePreparationStanding(f.fiscal, open)).toBe(false);
    for (const state of ['submitted', 'calculated', 'calculation_heard', 'review_decided'])
      expect(evidencePreparationRoles({ ...open, state })).toEqual([]);
  });
  it('requires synthetic notice inputs and separates hearing evidence from the final decision', () => {
    const actions = workflow('financial_schedule').actions;
    expect(() => parseFields(actions.find((a) => a.key === 'calculate')!.fields, {})).toThrow();
    expect(
      actions
        .find((a) => a.key === 'record_calculation_hearing')!
        .fields.some((f) => f.key === 'evidenceIds' && f.required),
    ).toBe(true);
    expect(
      actions.find((a) => a.key === 'decide_calculation_review')!.fields.map((f) => f.key),
    ).not.toContain('evidenceIds');
  });
});
