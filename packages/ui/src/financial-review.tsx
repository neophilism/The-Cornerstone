import { FinancialReviewSchema, type CaseRecord } from '@cornerstone/contracts';

export function FinancialReviewSummary({ record }: { record: CaseRecord }) {
  const parsed = FinancialReviewSchema.safeParse(record.data['financialReview']);
  if (!parsed.success || parsed.data.basis.recordId !== record.id) return null;
  const review = parsed.data;
  const rows = [
    ['Original calculated state share', String(review.originalCalculation['statePayment'])],
    ['Amount disputed in the appeal', review.disputedAmount],
    ['Undisputed amount when filed', review.undisputedAmount],
    ...(review.decision
      ? [
          ['State share after review', review.decision.reviewedStatePayment],
          ['Change from the appealed calculation', review.decision.adjustment],
        ]
      : []),
  ];
  return (
    <section className="calculation-summary financial-review-summary">
      <h2>{review.decision ? 'Calculation review decision' : 'Your calculation appeal'}</h2>
      <p className="hint">
        Synthetic review only. A request does not stay collection of undisputed amounts. These
        records establish no legal service, court filing, payment or refund.
      </p>
      <dl className="record-data">
        {rows.map(([label, amount]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt>{label} (USD)</dt>
            <dd>{amount}</dd>
          </div>
        ))}
        <dt>Synthetic calculation notice</dt>
        <dd>{review.basis.noticeDate}</dd>
        <dt>Synthetic filing deadline</dt>
        <dd>{review.filingDeadline}</dd>
        <dt>Appeal received</dt>
        <dd>{review.requestedAt.slice(0, 10)}</dd>
        {review.hearing && (
          <>
            <dt>Synthetic hearing date</dt>
            <dd>{review.hearing.date}</dd>
          </>
        )}
        {review.hearingRecord && (
          <>
            <dt>Hearing record closed</dt>
            <dd>
              {review.hearingRecord.recordedAt.slice(0, 10)} · version{' '}
              {review.hearingRecord.recordVersion}
            </dd>
            <dt>Frozen validated attachments</dt>
            <dd>{review.hearingRecord.evidence.length}</dd>
          </>
        )}
      </dl>
      <p className="hint">
        Unchanged method: {review.basis.terms.version} · Rate Act: {review.basis.terms.rateActId}
      </p>
      <h3>Grounds for review</h3>
      <p>{review.requestReasons}</p>
      {review.hearingRecord && (
        <>
          <h3>Recorded synthetic hearing</h3>
          <p>{review.hearingRecord.account}</p>
          <p className="hint">
            The decision uses the evidence revision frozen when this hearing record closed. New
            attachments are closed.
          </p>
        </>
      )}
      {review.decision && (
        <>
          <h3>
            {review.decision.disposition === 'affirm'
              ? 'Original calculation affirmed'
              : 'Inputs corrected under the original method'}
          </h3>
          <p>{review.decision.reasons}</p>
          <h3>Recorded route for further review</h3>
          <p>{review.decision.judicialReviewRoute}</p>
          <p className="hint">
            A lower reviewed amount is not a confirmed overpayment or an executed refund.
          </p>
        </>
      )}
    </section>
  );
}
