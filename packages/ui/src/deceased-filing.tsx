import type { CaseRecord } from '@cornerstone/contracts';
import { ClaimControlDetails, claimCapacityLabel } from './claim-survival.js';

export function DeceasedFilingSummary({
  record,
  disabled,
  onOpen,
}: {
  record: CaseRecord;
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  if (record.kind === 'claim' && record.data['deceasedFilingId'])
    return (
      <section className="action-panel" style={{ marginTop: 24 }}>
        <h2>Prove the original worker’s eligibility</h2>
        <p>
          This separate claim was opened after synthetic standing review. Describe the deceased
          worker’s livelihood, income or hours and direct injury. Add the worker’s eligibility
          evidence here; the death and succession packet has not been copied into this case.
        </p>
        <p className="hint">
          Standing does not certify eligibility or create membership. Current case control is
          specific to this claim; no account, unrelated record or additional vote is inherited.
        </p>
        <ClaimControlDetails record={record} />
        <button
          type="button"
          className="button button-secondary"
          disabled={disabled}
          onClick={() => onOpen(String(record.data['deceasedFilingId']))}
        >
          Open the standing packet
        </button>
      </section>
    );
  if (record.kind !== 'deceased_filing') return null;
  const reviewed = record.data['reviewedFiling'] as Record<string, unknown> | undefined;
  return (
    <section className="action-panel" style={{ marginTop: 24 }}>
      <h2>One worker, one undivided claim</h2>
      <p>
        The proposed federal act’s section 3(e) separates the original worker’s eligibility from
        proof of death and the succession chain. Prepare this packet in your own account. A
        synthetic worker reference provides no access to that person’s account or private files.
      </p>
      <p className="hint">
        Use this route when no claim exists for the worker. Continuing an existing claim and
        succession to an enrolled founding unit have their own workflows. Approved standing is not a worker claim. These are synthetic
        preparation and review records, not probate decisions or government acceptance.
      </p>
      {reviewed && (
        <details className="standing-review-details">
          <summary>Inspect the standing packet reviewed</summary>
          <dl className="record-detail-list">
            <dt>Requested capacity reviewed</dt>
            <dd>{claimCapacityLabel(reviewed['capacity'])}</dd>
            <dt>Packet version when review began</dt>
            <dd>{String(reviewed['reviewVersion'])}</dd>
            <dt>Worker reference reviewed</dt>
            <dd className="workspace-id">{String(reviewed['workerId'])}</dd>
            <dt>Applicant reference reviewed</dt>
            <dd className="workspace-id">{String(reviewed['applicantId'])}</dd>
          </dl>
          <p className="hint">
            These identify the packet considered. Review alone does not approve standing or
            establish eligibility.
          </p>
        </details>
      )}
      {record.state === 'approved' && (
        <div className="receipt">
          <strong>Standing recorded; eligibility is still unproved.</strong>
          <p>
            The approved applicant can use the form below to open the one eligibility draft. Use the
            worker’s pre-action livelihood and injury, then add separate supporting evidence before
            submitting that claim.
          </p>
        </div>
      )}
      {record.state === 'claim_opened' && typeof record.data['openedClaimId'] === 'string' && (
        <div className="receipt">
          <strong>The worker’s eligibility draft is ready to prepare.</strong>
          <p>
            Continue this same claim. Opening it created no eligibility finding, founding unit or
            membership consent. The accepted opening receipt identifies this one draft.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={disabled}
            onClick={() => onOpen(String(record.data['openedClaimId']))}
          >
            Open the worker’s eligibility draft
          </button>
        </div>
      )}
    </section>
  );
}
