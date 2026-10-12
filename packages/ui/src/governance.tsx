import { OpportunityBindingSchema, type CaseRecord } from '@cornerstone/contracts';
export function GovernanceSummary({
  record,
  onVote,
  onOpen,
}: {
  record: CaseRecord;
  onVote?: () => void;
  onOpen: (id: string) => void;
}) {
  const parsed = OpportunityBindingSchema.safeParse(record.data['opportunityBinding']);
  if (record.kind === 'resolution' && parsed.success) {
    const binding = parsed.data;
    return (
      <section className="action-panel" style={{ marginTop: 24 }}>
        <h2>The exact plan this vote covers</h2>
        <p>
          Voting yes supports the complete plan below, not a different opportunity. Approval does
          not require anyone to work, train, relocate, invest or take on personal debt.
        </p>
        <h3>{binding.plan.title}</h3>
        <p>
          {binding.plan.trade} · {binding.plan.district}
        </p>
        <dl className="record-detail-list">
          <dt>Feasibility</dt>
          <dd>{binding.plan.feasibility}</dd>
          <dt>Training and first opportunities</dt>
          <dd>{binding.plan.trainingPlan}</dd>
          <dt>Enterprise financing</dt>
          <dd>{binding.plan.capitalPlan}</dd>
          <dt>Permits and legal prerequisites</dt>
          <dd>{binding.plan.permitPlan}</dd>
        </dl>
        <p className="hint">
          This optional planning vote is not a compact, license, match, funding commitment or
          restoration finding. A majority of all frozen founding units must vote yes.
        </p>
        <details>
          <summary>Inspect the bound plan version</summary>
          <p>Proposal version {binding.version}</p>
          <p className="workspace-id">SHA-256: {binding.digest}</p>
        </details>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onOpen(binding.recordId)}
        >
          Open the shared plan
        </button>
      </section>
    );
  }
  if (record.kind !== 'opportunity' || !['proposed', 'adopted', 'withdrawn'].includes(record.state))
    return null;
  return (
    <section className="action-panel" style={{ marginTop: 24 }}>
      <h2>A member plan, not permission to operate</h2>
      <p>
        The shared proposal stays fixed. Current founding members may inspect the plan and its
        attachments. A different plan needs a new proposal and its own decision.
      </p>
      <p className="hint">
        Individual work, training, relocation, investment and personal debt remain voluntary. No
        license, financing, accepted match or restoration finding is created here.
      </p>
      {record.state === 'proposed' && (
        <>
          <p>
            Open an opportunity-plan resolution to seek a majority of all founding units. A generic
            or unrelated resolution cannot approve this plan.
          </p>
          {onVote && (
            <button type="button" className="button" onClick={onVote}>
              Start a vote on this plan
            </button>
          )}
        </>
      )}
      {record.state === 'adopted' && (
        <div className="receipt">
          <strong>Member plan adopted in simulation.</strong>
          <p>Separate legal, financing, matching and launch prerequisites remain outstanding.</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => onOpen(String(record.data['adoptedResolutionId']))}
          >
            Inspect the approving vote
          </button>
        </div>
      )}
      {record.state === 'withdrawn' && (
        <p>
          This proposal was withdrawn. Its history remains inspectable, but it cannot be adopted or
          used to open a new vote.
        </p>
      )}
    </section>
  );
}
