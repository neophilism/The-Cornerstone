import {
  DateSchema,
  FinancialCalculationBasisSchema,
  FinancialReviewSchema,
  IdSchema,
  MoneySchema,
  SurplusPreparationSchema,
  type Actor,
  type CaseRecord,
  type FinancialCalculationBasis,
  type FinancialReview,
} from '@cornerstone/contracts';
import {
  addCalendarDays,
  DomainError,
  requireCondition,
  financialAdjudicationActions,
  independentFinancialReviewer,
} from '@cornerstone/domain';
import { cents, money } from '@cornerstone/finance';
import { digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';
import { calculateWireSchedule } from './financial-calculation.js';
import { EvidenceService } from './evidence.js';

export function freezeFinancialBasis(
  record: CaseRecord,
  data: Record<string, unknown>,
  actor: Actor,
  compact: CaseRecord,
  offer: CaseRecord,
  now: string,
) {
  const basis = FinancialCalculationBasisSchema.parse({
    schemaVersion: 1,
    recordId: record.id,
    recordVersion: record.version + 1,
    actorId: actor.id,
    institutionId: actor.institutionId,
    calculatedAt: now,
    noticeDate: data['noticeDate'],
    noticeReference: data['noticeReference'],
    compactId: compact.id,
    compactVersion: compact.version,
    offerId: offer.id,
    offerVersion: offer.version,
    enterpriseId: compact.data['associationId'],
    fiscalYear: data['fiscalYear'],
    terms: offer.data['financialTerms'],
    scheduleDigest: digest(SurplusPreparationSchema.parse(data['schedule'])),
    calculationDigest: digest(data['calculation']),
  });
  requireCondition(
    basis.noticeDate <= now.slice(0, 10),
    'FUTURE_FINANCIAL_NOTICE',
    'Record an existing synthetic calculation notice, not future service.',
  );
  const previous = record.data['financialBasis'];
  if (previous) {
    const original = FinancialCalculationBasisSchema.parse(previous);
    requireCondition(
      original.compactId === basis.compactId &&
        original.offerId === basis.offerId &&
        original.enterpriseId === basis.enterpriseId &&
        original.fiscalYear === basis.fiscalYear &&
        digest(original.terms) === digest(basis.terms),
      'FINANCIAL_METHOD_CHANGED',
      'A correction cannot change the compact, enterprise, fiscal year or published rate and method.',
    );
  }
  return basis;
}

function calculateUnderBasis(schedule: unknown, basis: FinancialCalculationBasis) {
  return calculateWireSchedule({
    ...SurplusPreparationSchema.parse(schedule),
    terms: basis.terms,
    enterpriseId: basis.enterpriseId,
    year: basis.fiscalYear,
  });
}

export function financialReviewRequest(
  record: CaseRecord,
  actor: Actor,
  data: Record<string, unknown>,
  now: string,
  reviewInstitutionId: string,
) {
  requireCondition(
    record.kind === 'financial_schedule' &&
      record.state === 'calculated' &&
      record.realm === 'simulation' &&
      actor.realm === record.realm &&
      actor.id === record.ownerId,
    'FINANCIAL_APPELLANT_REQUIRED',
    'Only the owner of this synthetic calculated schedule may request its review.',
  );
  const basis = FinancialCalculationBasisSchema.parse(record.data['financialBasis']);
  const schedule = SurplusPreparationSchema.parse(record.data['schedule']);
  const calculation = calculateUnderBasis(schedule, basis);
  requireCondition(
    basis.recordId === record.id &&
      basis.recordVersion <= record.version &&
      basis.compactId === record.data['compactId'] &&
      basis.fiscalYear === record.data['fiscalYear'] &&
      basis.scheduleDigest === digest(schedule) &&
      basis.calculationDigest === digest(calculation) &&
      basis.calculationDigest === digest(record.data['calculation']),
    'FINANCIAL_BASIS_MISMATCH',
    'The saved calculation and its fixed financial basis must agree before review.',
  );
  const today = DateSchema.parse(now.slice(0, 10)),
    filingDeadline = addCalendarDays(basis.noticeDate, 60);
  requireCondition(
    today >= basis.noticeDate && today <= filingDeadline,
    'FINANCIAL_REVIEW_DEADLINE',
    'This synthetic appeal must be filed within 60 calendar days of its recorded calculation notice.',
  );
  const disputed = cents(MoneySchema.parse(data['disputedAmount'])),
    original = cents(MoneySchema.parse(calculation['statePayment']));
  requireCondition(
    disputed >= 0n && disputed <= original,
    'DISPUTED_AMOUNT_EXCEEDS_CALCULATION',
    'The disputed amount cannot exceed the calculated state share.',
  );
  return FinancialReviewSchema.parse({
    status: 'requested',
    basis,
    requestedAt: now,
    requestedBy: actor.id,
    appealedVersion: record.version,
    requestReasons: data['reasons'],
    filingDeadline,
    disputedAmount: money(disputed),
    undisputedAmount: money(original - disputed),
    originalSchedule: schedule,
    originalCalculation: calculation,
    reviewInstitutionId: IdSchema.parse(reviewInstitutionId),
  });
}

export function financialReviewDecision(
  record: CaseRecord,
  actor: Actor,
  data: Record<string, unknown>,
  now: string,
) {
  const review = FinancialReviewSchema.parse(record.data['financialReview']);
  const basis = review.basis;
  requireCondition(
    record.kind === 'financial_schedule' &&
      record.state === 'calculation_heard' &&
      review.status === 'heard' &&
      review.hearing &&
      review.hearingRecord &&
      review.hearing.date <= now.slice(0, 10),
    'FINANCIAL_HEARING_REQUIRED',
    'Close the scheduled synthetic hearing record before deciding its calculation appeal.',
  );
  requireCondition(
    independentFinancialReviewer(actor, record),
    'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
    'An assigned, unconflicted adjudicator from a different institution must decide this review.',
  );
  requireCondition(
    basis.recordId === record.id &&
      basis.compactId === record.data['compactId'] &&
      basis.fiscalYear === record.data['fiscalYear'] &&
      basis.scheduleDigest === digest(review.originalSchedule) &&
      basis.calculationDigest === digest(review.originalCalculation) &&
      basis.calculationDigest === digest(calculateUnderBasis(review.originalSchedule, basis)) &&
      basis.scheduleDigest === digest(record.data['schedule']) &&
      basis.calculationDigest === digest(record.data['calculation']),
    'FINANCIAL_BASIS_MISMATCH',
    'Review must retain the appealed calculation until a complete decision is accepted.',
  );
  requireCondition(
    review.hearingRecord.recordVersion === record.version &&
      review.hearingRecord.evidenceDigest === digest(review.hearingRecord.evidence) &&
      digest(record.data['evidenceIds']) === digest(review.hearingRecord.evidence.map((e) => e.id)),
    'FINANCIAL_HEARING_BASIS_MISMATCH',
    'The decision must use the closed hearing record and its exact validated evidence revision.',
  );
  const schedule = SurplusPreparationSchema.parse(data['schedule']);
  const disposition = data['disposition'];
  requireCondition(
    disposition === 'correct' ||
      (disposition === 'affirm' && digest(schedule) === basis.scheduleDigest),
    'FINANCIAL_REVIEW_DISPOSITION',
    'Affirm the original inputs or record a reasoned correction under the same published method.',
  );
  const calculation = calculateUnderBasis(schedule, basis),
    original = cents(MoneySchema.parse(review.originalCalculation['statePayment'])),
    revised = cents(MoneySchema.parse(calculation['statePayment']));
  const next = FinancialReviewSchema.parse({
    ...review,
    status: 'decided',
    decision: {
      disposition,
      decidedAt: now,
      reviewerId: actor.id,
      hearingRecordVersion: review.hearingRecord.recordVersion,
      reasons: data['reasons'],
      judicialReviewRoute: data['judicialReviewRoute'],
      evidenceIds: review.hearingRecord.evidence.map((item) => item.id),
      evidenceDigest: review.hearingRecord.evidenceDigest,
      originalStatePayment: money(original),
      reviewedStatePayment: money(revised),
      adjustment: money(revised - original),
      scheduleDigest: digest(schedule),
      calculationDigest: digest(calculation),
    },
  });
  return { review: next, schedule, calculation };
}

export class FinancialReviewService {
  constructor(readonly store: Store) {}
  async prepare(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    action: string,
    data: Record<string, unknown>,
    now: string,
  ): Promise<{ data: Record<string, unknown>; institutionId?: string }> {
    if (action === 'request_review') {
      // Validate the complete request before routing. SQL independently restricts the handoff.
      const original = FinancialCalculationBasisSchema.parse(record.data['financialBasis']);
      financialReviewRequest(record, actor, data, now, original.institutionId);
      const result = await tx
        .query('SELECT simulation_route_financial_review($1,$2) AS institution', [
          record.id,
          record.version,
        ])
        .catch((error: unknown) => {
          const failure = error as { code?: string; message?: string };
          if (
            failure.code === 'P0001' &&
            ['FINANCIAL_REVIEW_ROUTE_UNAVAILABLE', 'FINANCIAL_REVIEWER_UNAVAILABLE'].includes(
              failure.message ?? '',
            )
          )
            throw new DomainError(
              'FINANCIAL_REVIEW_ROUTING_UNAVAILABLE',
              'An independent, unconflicted adjudicator must be available before this synthetic appeal can be routed. No appeal was saved; the original calculation is unchanged.',
              409,
            );
          throw error;
        });
      const institutionId = IdSchema.parse(result.rows[0]?.institution);
      data['financialReview'] = financialReviewRequest(record, actor, data, now, institutionId);
      return { data, institutionId };
    }
    if (!financialAdjudicationActions.includes(action)) return { data };
    const review = FinancialReviewSchema.parse(record.data['financialReview']);
    requireCondition(
      independentFinancialReviewer(actor, record),
      'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
      'An assigned, unconflicted independent adjudicator is required; the owner, original calculator or institution cannot adjudicate this calculation.',
    );
    const currentScope = await tx.query('SELECT simulation_financial_reviewer($1) AS allowed', [
      record.id,
    ]);
    requireCondition(
      currentScope.rows[0]?.allowed === true,
      'INDEPENDENT_FINANCIAL_REVIEWER_REQUIRED',
      'Current independent adjudicator role, assignment and unconflicted standing are required.',
    );
    const prior = await tx.query(
      "SELECT 1 FROM receipts WHERE record_id=$1 AND actor_id=$2 AND action IN ('calculate','correct') LIMIT 1",
      [record.id, actor.id],
    );
    requireCondition(
      !prior.rowCount,
      'FINANCIAL_REVIEWER_PRIOR_INVOLVEMENT',
      'An adjudicator who calculated or corrected this schedule must recuse.',
    );
    if (action === 'begin_calculation_review') {
      requireCondition(
        record.state === 'review_requested' && review.status === 'requested',
        'FINANCIAL_REVIEW_STAGE',
        'Only a pending calculation appeal can be scheduled.',
      );
      const date = DateSchema.parse(data['hearingDate']);
      requireCondition(
        date >= review.requestedAt.slice(0, 10),
        'FINANCIAL_HEARING_DATE',
        'The synthetic hearing cannot precede the appeal.',
      );
      data['financialReview'] = FinancialReviewSchema.parse({
        ...review,
        status: 'scheduled',
        hearing: { date, noticeReference: data['noticeReference'] },
      });
    } else if (action === 'record_calculation_hearing') {
      requireCondition(
        record.state === 'calculation_review' &&
          review.status === 'scheduled' &&
          review.hearing &&
          review.hearing.date <= now.slice(0, 10),
        'FINANCIAL_HEARING_REQUIRED',
        'Record the synthetic hearing on or after its scheduled date.',
      );
      const evidence = await new EvidenceService(
        this.store,
        'simulation',
        'simulation',
        'synthetic-postgres',
      ).assertAvailable(
        tx,
        record.id,
        (data['evidenceIds'] as unknown[]).map((id) => IdSchema.parse(id)),
      );
      data['evidenceIds'] = evidence.map((item) => item.id);
      data['financialReview'] = FinancialReviewSchema.parse({
        ...review,
        status: 'heard',
        hearingRecord: {
          recordedAt: now,
          reviewerId: actor.id,
          recordVersion: record.version + 1,
          account: data['hearingRecord'],
          evidence,
          evidenceDigest: digest(evidence),
        },
      });
    } else {
      const result = financialReviewDecision(record, actor, data, now);
      const evidence = await new EvidenceService(
        this.store,
        'simulation',
        'simulation',
        'synthetic-postgres',
      ).assertAvailable(tx, record.id, result.review.decision!.evidenceIds);
      requireCondition(
        digest(evidence) === result.review.hearingRecord!.evidenceDigest,
        'FINANCIAL_HEARING_BASIS_MISMATCH',
        'The validated evidence revision changed after the hearing record closed.',
      );
      data['financialReview'] = result.review;
      data['schedule'] = result.schedule;
      data['calculation'] = result.calculation;
    }
    return { data };
  }
}
