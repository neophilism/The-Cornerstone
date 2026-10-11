import type { CaseRecord } from '@cornerstone/contracts';
export function ClaimSurvivalSummary({
  record,
  onOpen,
}: {
  record: CaseRecord;
  onOpen: (id: string) => void;
}) {
  if (record.kind === 'claim' && record.data['claimControl']) {
    return (
      <section className="action-panel" style={{ marginTop: 24 }}>
        <h2>The original claim continues</h2>
        <p>
          Case-specific succession changes who may prove or exercise this claim. The worker's
          injury, original claim reference, historical receipts and eligibility state remain
          separate from that change.
        </p>
        <p className="hint">
          This is not access to a different account, a second claim, or a new founding unit. A later
          founding invitation still requires your own informed consent.
        </p>
      </section>
    );
  }
  if (record.kind !== 'claim_survival') return null;
  const reviewed = record.data['reviewedClaim'] as Record<string, unknown> | undefined;
  return (
    <section className="action-panel" style={{ marginTop: 24 }}>
      <h2>One continuing claim, not a new benefit</h2>
      <p>
        Before enrollment, an assigned reviewer may establish one successor's or estate
        representative's authority over this specific claim file. The original worker's eligibility
        must still be proved. An enrolled claim follows the separate founding-unit succession route.
      </p>
      <p className="hint">
        A reference alone grants no access. Approved case-specific control ends prior delegated
        access to that claim; it does not transfer the original account, unrelated records or a
        founding unit. Use invented development information only.
      </p>
      {record.state === 'approved' && (
        <div className="receipt">
          <strong>Claim control updated; eligibility was not changed.</strong>
          <p>
            Continue the same claim through its existing preparation or review stage. Any later
            founding invitation requires your personal response.
          </p>
          <button type="button" onClick={() => onOpen(String(record.data['claimId']))}>
            Open the continuing claim
          </button>
        </div>
      )}
      {reviewed && (
        <details>
          <summary>Claim version reviewed</summary>
          <dl className="record-detail-list">
            <dt>Original claim</dt>
            <dd className="workspace-id">{String(reviewed['claimId'])}</dd>
            <dt>Claim version at review</dt>
            <dd>{Number(reviewed['claimVersion'])}</dd>
            <dt>Eligibility stage at review</dt>
            <dd>{String(reviewed['claimState']).replaceAll('_', ' ')}</dd>
            <dt>Holder version at review</dt>
            <dd>{Number(reviewed['holderVersion'])}</dd>
          </dl>
        </details>
      )}
    </section>
  );
}
