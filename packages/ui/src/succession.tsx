import type { CaseRecord } from '@cornerstone/contracts';
export function SuccessionSummary({ record }: { record: CaseRecord }) {
  if (record.kind !== 'succession') return null;
  const reviewed = record.data['reviewedUnit'] as Record<string, unknown> | undefined;
  return (
    <section className="action-panel" style={{ marginTop: 24 }}>
      <h2>One unit, not another vote</h2>
      <p>
        This request concerns an existing founding unit after a death, or a final designation while
        one estate representative holds it. It does not divide a unit among heirs, transfer a
        private account, add personal debt or reveal a previous holder's ballot.
      </p>
      <p className="hint">
        An un-enrolled claim needs a separate succession route, which this adapter does not yet
        implement. These are invented development records, not identity proof or a probate decision.
      </p>
      {record.state === 'approved' && (
        <p className="badge">
          Synthetic holder updated; the existing unit and any used votes remain unchanged.
        </p>
      )}
      {reviewed && (
        <details>
          <summary>Unit reviewed for this request</summary>
          <dl className="record-detail-list">
            <dt>Founding unit</dt>
            <dd className="workspace-id">{String(reviewed['unitId'])}</dd>
            <dt>Holder version reviewed</dt>
            <dd>{Number(reviewed['holderVersion'])}</dd>
            <dt>Current capacity at review</dt>
            <dd>{String(reviewed['holderCapacity']).replaceAll('_', ' ')}</dd>
            <dt>Original claim retained</dt>
            <dd className="workspace-id">{String(reviewed['claimId'])}</dd>
          </dl>
          <p className="hint">
            References do not grant access to the original private claim. A changed holder requires
            a fresh review.
          </p>
        </details>
      )}
    </section>
  );
}
