import type { CaseRecord } from '@cornerstone/contracts';
export function claimCapacityLabel(value: unknown) {
  return value === 'estate_representative'
    ? 'Estate representative'
    : value === 'designated_successor'
      ? 'Designated successor'
      : value === 'worker'
        ? 'Original worker'
        : 'Capacity unavailable';
}
export function ClaimControlDetails({ record }: { record: CaseRecord }) {
  const control = record.data['claimControl'] as Record<string, unknown> | undefined;
  if (record.kind !== 'claim' || !control) return null;
  return (
    <div className="claim-control-summary">
      <p>
        Recorded capacity: <strong>{claimCapacityLabel(control['capacity'])}</strong>.
      </p>
      <details>
        <summary>Inspect the worker and current holder references</summary>
        <dl className="record-detail-list">
          <dt>Original worker</dt>
          <dd className="workspace-id">{String(control['originalWorkerId'])}</dd>
          <dt>Current case holder</dt>
          <dd className="workspace-id">{String(control['holderId'])}</dd>
          <dt>Scope of this recorded authority</dt>
          <dd>This claim only. Eligibility and any later membership decision remain separate.</dd>
        </dl>
      </details>
    </div>
  );
}
export function ClaimSurvivalSummary({
  record,
  onOpen,
}: {
  record: CaseRecord;
  onOpen: (id: string) => void;
}) {
  if (record.kind === 'claim' && record.data['claimControl'] && !record.data['deceasedFilingId']) {
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
        <ClaimControlDetails record={record} />
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
            <dt>Holder capacity at review</dt>
            <dd>{claimCapacityLabel(reviewed['holderCapacity'])}</dd>
            <dt>Original worker reference</dt>
            <dd className="workspace-id">{String(reviewed['originalWorkerId'])}</dd>
            <dt>Holder reference at review</dt>
            <dd className="workspace-id">{String(reviewed['predecessorId'])}</dd>
            <dt>Rights-holder reference at review</dt>
            <dd className="workspace-id">{String(reviewed['rightsHolderId'])}</dd>
          </dl>
        </details>
      )}
    </section>
  );
}
